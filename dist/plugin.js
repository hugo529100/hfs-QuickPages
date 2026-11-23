exports.version = 2.6
exports.description = "A quick-access panel for HFS that lets users switch between multiple web pages via custom tabs."
exports.repo = "hugo529100/hfs-QuickPages"
exports.apiRequired = 8.87
exports.frontend_js = ['main.js']
exports.frontend_css = ['style.css']
exports.config = {
    tabList: {
        type: 'array',
        label: 'Tab List',
        fields: {
            name: { label: 'Tab Name' },
            url: { label: 'URL', helperText: 'The webpage address to load in this tab' },
            publicPage: {
                type: 'boolean',
                label: 'Allow public access (Guest)',
                defaultValue: false,
                helperText: 'When enabled, unauthenticated users (Guest) can view this page.'
            }
        },
        defaultValue: [{ name: 'General', url: '', publicPage: false }],
        helperText: 'Add or remove tabs. Each tab can load a different webpage.',
        frontend: true
    },
    restrictUsers: {
        type: 'boolean',
        label: 'Restrict user access',
        helperText: 'When enabled, only selected users below can access the panel. When disabled, all logged-in users can access.',
        defaultValue: false,
        frontend: true
    },
    allowedUsers: {
        type: 'username',
        multiple: true,
        label: 'Allowed users',
        helperText: 'Only applies when "Restrict user access" is enabled above.',
        showIf: x => x.restrictUsers,
        frontend: true
    }
}

exports.init = async api => {
    const { getCurrentUsername } = api.require('./auth')
    const fs = api.require('fs/promises')
    const path = api.require('path')
    const storage = api.storageDir
    
    const API_BASE = `${api.Const.API_URI}quickpages/`

    function getPublicPages() {
        const list = api.getConfig('tabList') || [{ name: 'General', url: '', publicPage: false }]
        return list.filter(t => t.publicPage === true).map(t => t.name).filter(Boolean)
    }

    function isAllowed(username) {
        if (!username) {
            const publicPages = getPublicPages()
            return publicPages.length > 0
        }
        if (username === 'admin') return true
        if (!api.getConfig('restrictUsers')) return true
        const allowed = api.getConfig('allowedUsers') || []
        return allowed.includes(username)
    }

    function hasPublicPages() {
        return getPublicPages().length > 0
    }

    function getTabs() {
        const list = api.getConfig('tabList') || [{ name: 'General', url: '' }]
        return list.filter(t => t.name).map(t => ({ name: t.name, url: t.url || '' }))
    }

    const TABS_DATA_FILE = path.join(storage, 'quickpages_tabs_order.json')
    
    // ====== 修复：优先保留 _tabs_order.json 中的排序 ======
    async function getTabsData() {
        const currentTabs = getTabs()
        const currentTabNames = currentTabs.map(t => t.name)
        const currentTabSet = new Set(currentTabNames)
        
        // 加载保存的数据
        let savedOrder = []
        let savedNames = {}
        
        try {
            const data = await fs.readFile(TABS_DATA_FILE, 'utf-8')
            const parsed = JSON.parse(data)
            
            // 兼容旧格式（纯数组）
            if (Array.isArray(parsed)) {
                savedOrder = parsed
                savedNames = {}
            } else {
                savedOrder = parsed.order || []
                savedNames = parsed.names || {}
            }
        } catch {
            // 文件不存在，使用默认值
            savedOrder = []
            savedNames = {}
        }
        
        // 1. 保留 _tabs_order.json 中已有的排序（过滤掉已删除的 tab）
        const validExistingOrder = savedOrder.filter(name => currentTabSet.has(name))
        
        // 2. 找出配置中有但映射中没有的新 tab（保持配置中的相对顺序）
        const existingSet = new Set(validExistingOrder)
        const newTabs = currentTabNames.filter(name => !existingSet.has(name))
        
        // 3. 合并：先保留原有排序，再追加新 tab
        const newOrder = [...validExistingOrder, ...newTabs]
        
        // 4. 清理已删除 tab 的自定义名称
        const cleanedNames = {}
        for (const [key, value] of Object.entries(savedNames)) {
            if (currentTabSet.has(key)) {
                cleanedNames[key] = value
            }
        }
        
        // 5. 如果有变化，保存
        const orderChanged = newOrder.length !== savedOrder.length || 
            newOrder.some((t, i) => t !== (savedOrder[i] || ''))
        const namesChanged = Object.keys(cleanedNames).length !== Object.keys(savedNames).length
        
        if (orderChanged || namesChanged) {
            await saveTabsData(newOrder, cleanedNames)
        }
        
        return { order: newOrder, names: cleanedNames }
    }
    // ====== 修复结束 ======
    
    async function saveTabsData(order, names = {}) {
        await fs.writeFile(TABS_DATA_FILE, JSON.stringify({ order, names }, null, 2))
    }

    async function getTabInfo(ctx) {
        const username = getCurrentUsername(ctx)
        const tabsData = await getTabsData()
        const tabs = getTabs()
        
        // 使用保存的排序，并过滤掉已删除的 tab
        const order = tabsData.order.length > 0 ? tabsData.order : tabs.map(t => t.name)
        const orderSet = new Set(order)
        // 确保所有当前 tab 都在 order 中（已由 getTabsData 保证）
        // 但为了安全，再做一次过滤
        let orderedTabs = order
            .filter(name => tabs.some(t => t.name === name))
            .map(name => tabs.find(t => t.name === name))
            .filter(Boolean)
        
        // 如果还有不在 order 中的 tab（理论上不会发生，但以防万一）
        const orderedNames = new Set(orderedTabs.map(t => t.name))
        const missingTabs = tabs.filter(t => !orderedNames.has(t.name))
        if (missingTabs.length > 0) {
            orderedTabs = [...orderedTabs, ...missingTabs]
        }
        
        // 访客只返回公开页面
        if (!username) {
            const publicPages = getPublicPages()
            orderedTabs = orderedTabs.filter(t => publicPages.includes(t.name))
        }
        
        if (username && !isAllowed(username)) {
            ctx.status = 403
            return
        }
        
        ctx.body = { 
            tabs: orderedTabs,
            tabNames: tabsData.names,
            publicTabs: getPublicPages(),
            isGuest: !username
        }
        ctx.status = 200
    }

    async function renameTab(ctx) {
        const username = getCurrentUsername(ctx)
        if (!username || !isAllowed(username)) { ctx.status = 403; return }
        
        let body = ctx.state.params || ctx.request?.body || {}
        const { tab, newName } = body
        
        if (!tab || newName === undefined) {
            ctx.status = 400; return
        }
        
        const tabsData = await getTabsData()
        if (newName.trim() === '') {
            delete tabsData.names[tab]
        } else {
            tabsData.names[tab] = newName.trim()
        }
        
        await saveTabsData(tabsData.order, tabsData.names)
        api.notifyClient('quickpages', 'tabRenamed', { tab, newName: newName.trim() || tab })
        ctx.body = { ok: true, tab, newName: newName.trim() || tab }
        ctx.status = 200
    }

    async function reorderTabs(ctx) {
        const username = getCurrentUsername(ctx)
        if (!username || !isAllowed(username)) { ctx.status = 403; return }
        
        let body = ctx.state.params || ctx.request?.body || {}
        const { tabs: newOrder } = body
        if (!newOrder || !Array.isArray(newOrder)) {
            ctx.status = 400; return
        }
        
        const tabsData = await getTabsData()
        await saveTabsData(newOrder, tabsData.names)
        api.notifyClient('quickpages', 'tabsReordered', { tabs: newOrder })
        ctx.body = { ok: true }
        ctx.status = 200
    }

    async function checkAccess(ctx) {
        const username = getCurrentUsername(ctx)
        const publicPages = getPublicPages()
        
        ctx.body = { 
            allowed: !!username || publicPages.length > 0,
            isGuest: !username,
            publicTabs: publicPages
        }
        ctx.status = 200
    }
    
    // 监听配置变化，同步排序
    api.subscribeConfig(['tabList'], async () => {
        try {
            // 重新同步排序
            await getTabsData()
            // 通知前端刷新
            const tabsData = await getTabsData()
            api.notifyClient('quickpages', 'tabsReordered', { tabs: tabsData.order })
        } catch (e) {
            console.error('QuickPages: Failed to sync tabs on config change:', e)
        }
    })
    
    return {
        async middleware(ctx) {
            const p = ctx.path
            if (!p.startsWith(API_BASE)) return
            
            const method = ctx.method.toUpperCase()
            
            if (p === `${API_BASE}check` && method === 'GET') { await checkAccess(ctx); return }
            if (p === `${API_BASE}tabs` && method === 'GET') { await getTabInfo(ctx); return }
            if (p === `${API_BASE}reorder-tabs` && method === 'POST') { await reorderTabs(ctx); return }
            if (p === `${API_BASE}rename-tab` && method === 'POST') { await renameTab(ctx); return }
        }
    }
}