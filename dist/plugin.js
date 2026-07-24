exports.version = 2.2
exports.description = "A quick-access panel for HFS that lets users switch between multiple web pages via custom tabs."
exports.repo = "Hug3O/QuickPages"
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
            // ====== 新增：公开访问配置 ======
            publicPage: {
                type: 'boolean',
                label: 'Allow public access (Guest)',
                defaultValue: false,
                helperText: 'When enabled, unauthenticated users (Guest) can view this page.'
            }
            // ====== 新增结束 ======
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

    // ====== 新增：获取公开页面列表 ======
    function getPublicPages() {
        const list = api.getConfig('tabList') || [{ name: 'General', url: '', publicPage: false }]
        return list.filter(t => t.publicPage === true).map(t => t.name).filter(Boolean)
    }
    // ====== 新增结束 ======

    function isAllowed(username) {
        if (!username) {
            // 访客只能访问公开页面
            const publicPages = getPublicPages()
            return publicPages.length > 0
        }
        if (username === 'admin') return true
        if (!api.getConfig('restrictUsers')) return true
        const allowed = api.getConfig('allowedUsers') || []
        return allowed.includes(username)
    }

    // ====== 新增：检查是否有公开页面 ======
    function hasPublicPages() {
        return getPublicPages().length > 0
    }
    // ====== 新增结束 ======

    function getTabs() {
        const list = api.getConfig('tabList') || [{ name: 'General', url: '' }]
        return list.filter(t => t.name).map(t => ({ name: t.name, url: t.url || '' }))
    }

    const TABS_DATA_FILE = path.join(storage, 'quickpages_tabs_order.json')
    
    async function getTabsData() {
        try {
            const data = await fs.readFile(TABS_DATA_FILE, 'utf-8')
            const saved = JSON.parse(data)
            const currentTabs = getTabs()
            let order, names
            if (Array.isArray(saved)) {
                order = saved
                names = {}
            } else {
                order = saved.order || []
                names = saved.names || {}
            }
            let valid = order.filter(t => currentTabs.some(ct => ct.name === t))
            for (const ct of currentTabs) {
                if (!valid.includes(ct.name)) valid.push(ct.name)
            }
            const cleanedNames = {}
            for (const [key, value] of Object.entries(names)) {
                if (currentTabs.some(ct => ct.name === key)) {
                    cleanedNames[key] = value
                }
            }
            if (valid.length !== order.length || 
                valid.some((t, i) => t !== order[i]) ||
                Object.keys(cleanedNames).length !== Object.keys(names).length) {
                await saveTabsData(valid, cleanedNames)
            }
            return { order: valid, names: cleanedNames }
        } catch {
            const tabs = getTabs()
            const order = tabs.map(t => t.name)
            await saveTabsData(order, {})
            return { order, names: {} }
        }
    }
    
    async function saveTabsData(order, names = {}) {
        await fs.writeFile(TABS_DATA_FILE, JSON.stringify({ order, names }, null, 2))
    }

    async function getTabInfo(ctx) {
        const username = getCurrentUsername(ctx)
        const tabsData = await getTabsData()
        const tabs = getTabs()
        const order = tabsData.order.length > 0 ? tabsData.order : tabs.map(t => t.name)
        let orderedTabs = order.map(name => tabs.find(t => t.name === name)).filter(Boolean)
        
        // ====== 修改：访客只返回公开页面 ======
        if (!username) {
            const publicPages = getPublicPages()
            orderedTabs = orderedTabs.filter(t => publicPages.includes(t.name))
        }
        // ====== 修改结束 ======
        
        // ====== 修改：权限检查 ======
        if (username && !isAllowed(username)) {
            ctx.status = 403
            return
        }
        // ====== 修改结束 ======
        
        ctx.body = { 
            tabs: orderedTabs,
            tabNames: tabsData.names,
            // ====== 新增：返回公开页面列表和访客状态 ======
            publicTabs: getPublicPages(),
            isGuest: !username
            // ====== 新增结束 ======
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

    // ====== 新增：检查访问权限接口 ======
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
    // ====== 新增结束 ======
    
    return {
        async middleware(ctx) {
            const p = ctx.path
            if (!p.startsWith(API_BASE)) return
            
            const method = ctx.method.toUpperCase()
            
            // ====== 新增：check 接口 ======
            if (p === `${API_BASE}check` && method === 'GET') { await checkAccess(ctx); return }
            // ====== 新增结束 ======
            if (p === `${API_BASE}tabs` && method === 'GET') { await getTabInfo(ctx); return }
            if (p === `${API_BASE}reorder-tabs` && method === 'POST') { await reorderTabs(ctx); return }
            if (p === `${API_BASE}rename-tab` && method === 'POST') { await renameTab(ctx); return }
        }
    }
}