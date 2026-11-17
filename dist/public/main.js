"use strict"; {
    const { h } = HFS;
    const { useState, useEffect, useRef, useMemo, useCallback } = HFS.React;

    // ====== 側邊分割面板寬度（參考 Notes）======
    const QP_PANEL_RATIO_CACHE = 'quickpages_panelRatio';
    const QP_PANEL_RATIO_DEFAULT = 32;
    const QP_PANEL_RATIO_MIN = 12;
    const QP_PANEL_RATIO_MAX = 60;
    const QP_PANEL_MIN_PX = 300;

    function getQpPanelRatioMin(vw = window.innerWidth) {
        if (!vw || vw <= 0) return QP_PANEL_RATIO_MIN;
        return Math.min(QP_PANEL_RATIO_MAX, Math.max(QP_PANEL_RATIO_MIN, (QP_PANEL_MIN_PX / vw) * 100));
    }
    function clampQpPanelRatio(val, vw = window.innerWidth) {
        if (!isFinite(val)) val = QP_PANEL_RATIO_DEFAULT;
        return Math.max(getQpPanelRatioMin(vw), Math.min(QP_PANEL_RATIO_MAX, val));
    }
    function loadQpPanelRatio() {
        try {
            const v = parseFloat(localStorage.getItem(QP_PANEL_RATIO_CACHE));
            if (isFinite(v)) return clampQpPanelRatio(v);
        } catch {}
        return clampQpPanelRatio(QP_PANEL_RATIO_DEFAULT);
    }
    function saveQpPanelRatio(val) {
        val = clampQpPanelRatio(val);
        if (!isFinite(val)) return;
        try { localStorage.setItem(QP_PANEL_RATIO_CACHE, String(val)); } catch {}
    }

    // ====== 面板展開狀態持久化（刷新後恢復展開）======
    const QP_PANEL_SHOW_CACHE = 'quickpages_panelShow';

    function loadQpPanelShow() {
        try {
            const v = localStorage.getItem(QP_PANEL_SHOW_CACHE);
            if (v === '0') return false;
            if (v === '1') return true;
        } catch {}
        return false;
    }
    function saveQpPanelShow(open) {
        try { localStorage.setItem(QP_PANEL_SHOW_CACHE, open ? '1' : '0'); } catch {}
    }
    // ====== 展開狀態結束 ======
    // ====== 寬度結束 ======

    // ====== 访客访问控制 ======
    async function checkAccess() {
        try {
            const res = await fetch('/~/api/quickpages/check');
            const data = await res.json();
            return {
                allowed: data.allowed || false,
                isGuest: data.isGuest || false,
                publicTabs: data.publicTabs || []
            };
        } catch {
            return {
                allowed: true,
                isGuest: false,
                publicTabs: []
            };
        }
    }
    // ====== 访客访问控制结束 ======

    function QuickPagePanel({ onClose, publicTabs: propPublicTabs = [], isGuest: propIsGuest = false }) {
        const [tabs, setTabs] = useState([]);
        const [activeTab, setActiveTab] = useState('');
        const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
        const [closing, setClosing] = useState(false);
        const [tabNames, setTabNames] = useState({});
        const [renamingTab, setRenamingTab] = useState(null);
        const [renameValue, setRenameValue] = useState('');
        const [isFullscreen, setIsFullscreen] = useState(false);
        const [isMultiColumn, setIsMultiColumn] = useState(false);
        const [otherTabData, setOtherTabData] = useState({});
        const [fullscreenLoadState, setFullscreenLoadState] = useState({});
        const renameInputRef = useRef(null);
        const iframeRef = useRef(null);
        const activeTabRef = useRef(activeTab);
        const headerRef = useRef(null);
        const panelRef = useRef(null);
        const isFullscreenRef = useRef(false);
        const fullscreenGridRef = useRef(null);
        const closingRef = useRef(false);
        const [panelRatio, setPanelRatio] = useState(loadQpPanelRatio);
        const panelRatioRef = useRef(panelRatio);
        const panelDragRef = useRef(null);
        const panelWindowListenersRef = useRef(null);
        
        // ====== 使用传入的访客状态 ======
        const isGuest = propIsGuest;
        const publicTabs = propPublicTabs;
        // ====== 访客状态结束 ======
        
        useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
        useEffect(() => { isFullscreenRef.current = isFullscreen; }, [isFullscreen]);
        useEffect(() => { closingRef.current = closing; }, [closing]);
        
        // 保存 activeTab 到 localStorage
        useEffect(() => {
            if (activeTab) {
                try {
                    localStorage.setItem('quickpages-active-tab', activeTab);
                } catch (e) {
                    console.error('Failed to save active tab:', e);
                }
            }
        }, [activeTab]);
        
        useEffect(() => {
            if (renamingTab && renameInputRef.current) {
                renameInputRef.current.focus();
                renameInputRef.current.select();
            }
        }, [renamingTab]);
        
        useEffect(() => {
            const handleResize = () => setIsMobile(window.innerWidth <= 768);
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }, []);

        // ====== 分割面板：body class / 寬度 / 拖曳調整 ======
        useEffect(() => {
            // 與 Notes 同一右側區域，開啟 QuickPages 時先收起 Notes
            if (document.body.classList.contains('note-panel-open')) {
                window.dispatchEvent(new CustomEvent('close-notes'));
            }
        }, []);

        useEffect(() => {
            const safeRatio = clampQpPanelRatio(panelRatio);
            document.body.style.setProperty('--qp-panel-width', safeRatio + 'vw');
        }, [panelRatio]);

        useEffect(() => { panelRatioRef.current = panelRatio; }, [panelRatio]);

        useEffect(() => {
            const handleResize = () => {
                // 全屏時視窗尺寸會變成螢幕尺寸，不要因此改掉使用者的分割寬度
                if (isFullscreenRef.current || document.fullscreenElement) return;
                // 手機是滿版 sheet，不需要把桌面的分割比例改成 300px 下限
                if (window.innerWidth <= 768) return;
                const clamped = clampQpPanelRatio(panelRatioRef.current);
                if (Math.abs(clamped - panelRatioRef.current) > 0.01) {
                    panelRatioRef.current = clamped;
                    setPanelRatio(clamped);
                    saveQpPanelRatio(clamped);
                }
            };
            handleResize();
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }, []);

        const detachPanelWindowListeners = useCallback(() => {
            const listeners = panelWindowListenersRef.current;
            if (!listeners) return;
            window.removeEventListener('pointermove', listeners.onMove, true);
            window.removeEventListener('pointerup', listeners.onEnd, true);
            window.removeEventListener('pointercancel', listeners.onEnd, true);
            panelWindowListenersRef.current = null;
        }, []);

        const handlePanelResizeMove = useCallback((e) => {
            const d = panelDragRef.current;
            if (!d) return;
            const dx = e.clientX - d.startX;
            if (!d.moved) {
                if (Math.abs(dx) < 3) return;
                d.moved = true;
            }
            e.preventDefault();
            let next = d.startRatio + (-dx / d.vw) * 100;
            next = Math.max(getQpPanelRatioMin(d.vw), Math.min(QP_PANEL_RATIO_MAX, next));
            d.lastRatio = next;
            document.body.style.setProperty('--qp-panel-width', next + 'vw');
        }, []);

        const handlePanelResizeEnd = useCallback((e) => {
            const d = panelDragRef.current;
            if (!d) return;
            panelDragRef.current = null;
            detachPanelWindowListeners();
            const target = e && e.currentTarget;
            if (target && typeof target.releasePointerCapture === 'function' && e.pointerId != null) {
                try { target.releasePointerCapture(e.pointerId); } catch {}
            }
            document.body.classList.remove('qp-panel-resizing');
            if (!d.moved) return;
            const finalRatio = clampQpPanelRatio(d.lastRatio);
            setPanelRatio(finalRatio);
            saveQpPanelRatio(finalRatio);
        }, [detachPanelWindowListeners]);

        const handlePanelResizeStart = useCallback((e) => {
            if (isFullscreenRef.current || isMobile) return;
            e.preventDefault();
            e.stopPropagation();
            const vw = window.innerWidth;
            const startRatio = clampQpPanelRatio(panelRatioRef.current, vw);
            panelDragRef.current = {
                startX: e.clientX,
                startRatio,
                vw,
                lastRatio: startRatio,
                moved: false
            };
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}

            // 直接掛在 window 上，面板邊緣移動時也不怕 pointer capture 失效
            detachPanelWindowListeners();
            const onMove = (ev) => handlePanelResizeMove(ev);
            const onEnd = (ev) => handlePanelResizeEnd(ev);
            panelWindowListenersRef.current = { onMove, onEnd };
            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onEnd, true);
            window.addEventListener('pointercancel', onEnd, true);

            document.body.classList.add('qp-panel-resizing');
        }, [isMobile, handlePanelResizeMove, handlePanelResizeEnd, detachPanelWindowListeners]);

        useEffect(() => () => detachPanelWindowListeners(), [detachPanelWindowListeners]);
        // ====== 分割面板設定結束 ======

        // ====== 全屏模式切换 - 手机禁用 ======
        const toggleFullscreen = useCallback(() => {
            if (isMobile) {
                HFS.toast?.('Fullscreen mode not available on mobile', 'info');
                return;
            }

            const el = document.documentElement;
            
            if (!isFullscreenRef.current) {
                el.requestFullscreen?.()
                    .then(() => {
                        setIsFullscreen(true);
                    })
                    .catch(err => {
                        HFS.toast?.("Enter fullscreen failed: " + err, 'error');
                    });
            } else {
                document.exitFullscreen?.();
                setIsFullscreen(false);
                setIsMultiColumn(false);
                setOtherTabData({});
                setFullscreenLoadState({});
            }
        }, [isMobile]);
        // ====== 全屏切换结束 ======

        // 监听全屏变化事件
        useEffect(() => {
            const handleFullscreenChange = () => {
                const isFs = !!document.fullscreenElement;
                setIsFullscreen(isFs);
                if (!isFs) {
                    setIsMultiColumn(false);
                    setOtherTabData({});
                    setFullscreenLoadState({});
                }
            };
            document.addEventListener('fullscreenchange', handleFullscreenChange);
            return () => {
                document.removeEventListener('fullscreenchange', handleFullscreenChange);
            };
        }, []);

        // 切换三列模式
        const toggleMultiColumn = useCallback(() => {
            const newState = !isMultiColumn;
            setIsMultiColumn(newState);
            if (newState) {
                const otherTabs = tabs.filter(t => t.name !== activeTab);
                otherTabs.forEach(tab => {
                    loadOtherTabNotes(tab);
                });
            } else {
                setOtherTabData({});
                setFullscreenLoadState({});
            }
        }, [isMultiColumn, tabs, activeTab]);

        // 加载其他 tab 的 notes
        const loadOtherTabNotes = useCallback(async (tab) => {
            if (!tab) return;
            try {
                const res = await fetch(`/~/api/quickpages/tabs`);
                const data = await res.json();
                const tabData = data.tabs?.find(t => t.name === tab);
                if (tabData && tabData.url) {
                    setOtherTabData(prev => ({
                        ...prev,
                        [tab]: {
                            url: tabData.url,
                            loaded: true
                        }
                    }));
                    setFullscreenLoadState(prev => ({
                        ...prev,
                        [tab]: { loading: false }
                    }));
                }
            } catch (e) {
                console.error('load other tab:', e);
            }
        }, []);

        useEffect(() => {
            if (!isMobile) return;
            
            const handleVisualViewport = () => {
                const viewport = window.visualViewport;
                if (!viewport || !headerRef.current) return;
                
                const headerHeight = headerRef.current.offsetHeight;
                const panelTop = headerRef.current.closest('.qp-panel')?.getBoundingClientRect().top || 0;
                
                if (viewport.height < window.innerHeight) {
                    const offsetTop = Math.max(0, panelTop);
                    headerRef.current.style.position = 'sticky';
                    headerRef.current.style.top = offsetTop + 'px';
                    headerRef.current.style.zIndex = '10';
                    headerRef.current.style.background = 'var(--bg)';
                    
                    const tabsContainer = headerRef.current.nextElementSibling;
                    if (tabsContainer && tabsContainer.classList.contains('qp-tabs-container')) {
                        tabsContainer.style.position = 'sticky';
                        tabsContainer.style.top = (offsetTop + headerRef.current.offsetHeight) + 'px';
                        tabsContainer.style.zIndex = '10';
                        tabsContainer.style.background = 'var(--bg)';
                    }
                } else {
                    if (headerRef.current) {
                        headerRef.current.style.position = '';
                        headerRef.current.style.top = '';
                        headerRef.current.style.zIndex = '';
                        headerRef.current.style.background = '';
                    }
                    const tabsContainers = document.querySelectorAll('.qp-tabs-container');
                    tabsContainers.forEach(el => {
                        el.style.position = '';
                        el.style.top = '';
                        el.style.zIndex = '';
                        el.style.background = '';
                    });
                }
            };
            
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', handleVisualViewport);
                window.visualViewport.addEventListener('scroll', handleVisualViewport);
            }
            
            return () => {
                if (window.visualViewport) {
                    window.visualViewport.removeEventListener('resize', handleVisualViewport);
                    window.visualViewport.removeEventListener('scroll', handleVisualViewport);
                }
            };
        }, [isMobile]);

        const getTabDisplayName = useCallback((tabKey) => {
            return tabNames[tabKey] || tabKey;
        }, [tabNames]);

        // ====== 修改：使用 useCallback 包装 handleClose，便于在 useEffect 中使用 ======
        const handleClose = useCallback(() => {
            if (closingRef.current) return;
            // 使用者已按下關閉：立即記住，避免關閉動畫中刷新又自動展開
            saveQpPanelShow(false);
            setClosing(true);
            if (isFullscreenRef.current) {
                document.exitFullscreen?.().catch(() => {});
            }
            setTimeout(() => {
                onClose();
            }, 500);
        }, [onClose]);
        // ====== 修改结束 ======

        const handleRefresh = () => {
            if (iframeRef.current) {
                iframeRef.current.src = iframeRef.current.src;
            }
        };

        const handleRenameStart = (tab) => {
            if (isGuest) {
                HFS.toast?.('Please login to rename tabs', 'info');
                return;
            }
            setRenamingTab(tab);
            setRenameValue(tabNames[tab] || '');
        };

        const handleRenameSave = async () => {
            if (!renamingTab) return;
            if (isGuest) {
                HFS.toast?.('Please login to rename tabs', 'info');
                setRenamingTab(null);
                return;
            }
            const newName = renameValue.trim();
            try {
                await fetch('/~/api/quickpages/rename-tab', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tab: renamingTab, newName: newName })
                });
            } catch (e) {
                console.error('rename tab:', e);
            }
            setRenamingTab(null);
        };

        const handleRenameCancel = () => {
            setRenamingTab(null);
        };

        const handleRenameKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameSave();
            } else if (e.key === 'Escape') {
                handleRenameCancel();
            }
        };

        const loadTabs = useCallback(() => {
            fetch('/~/api/quickpages/tabs')
                .then(r => r.json())
                .then(data => {
                    let availableTabs = data.tabs || [];
                    if (isGuest && publicTabs.length > 0) {
                        availableTabs = availableTabs.filter(t => publicTabs.includes(t.name));
                    }
                    setTabs(availableTabs);
                    setTabNames(data.tabNames || {});
                    
                    const savedTab = localStorage.getItem('quickpages-active-tab');
                    const availableTabNames = availableTabs.map(t => t.name);
                    
                    if (savedTab && availableTabNames.includes(savedTab)) {
                        setActiveTab(savedTab);
                    } else if (availableTabs.length > 0 && !activeTabRef.current) {
                        setActiveTab(availableTabs[0].name);
                    } else if (availableTabs.length > 0 && !availableTabs.find(t => t.name === activeTabRef.current)) {
                        setActiveTab(availableTabs[0].name);
                    }
                })
                .catch(e => console.error('load tabs:', e));
        }, [isGuest, publicTabs]);

        useEffect(() => {
            loadTabs();
        }, [loadTabs]);

        useEffect(() => {
            try {
                const es = HFS.getNotifications('quickpages', (e, data) => {
                    if (!data) return;
                    
                    if (e === 'tabsReordered') {
                        if (data.tabs && Array.isArray(data.tabs)) {
                            const currentTabs = tabs;
                            let orderedTabs = data.tabs.map(name => 
                                currentTabs.find(t => t.name === name) || { name, url: '' }
                            ).filter(Boolean);
                            if (isGuest && publicTabs.length > 0) {
                                orderedTabs = orderedTabs.filter(t => publicTabs.includes(t.name));
                            }
                            setTabs(orderedTabs);
                            if (!orderedTabs.some(t => t.name === activeTabRef.current)) {
                                setActiveTab(orderedTabs[0]?.name || '');
                            }
                        }
                        return;
                    }
                    
                    if (e === 'tabRenamed') {
                        setTabNames(prev => {
                            const updated = { ...prev };
                            if (data.newName === data.tab || !data.newName) {
                                delete updated[data.tab];
                            } else {
                                updated[data.tab] = data.newName;
                            }
                            return updated;
                        });
                        return;
                    }
                });
                return () => es?.then?.(v => v?.close?.()).catch?.(() => {});
            } catch (e) {
                console.error('Failed to setup notifications:', e);
            }
        }, [tabs, isGuest, publicTabs]);

        const activeTabData = useMemo(() => {
            return tabs.find(t => t.name === activeTab) || null;
        }, [tabs, activeTab]);

        const moveTab = (tab, direction) => {
            if (isGuest) {
                HFS.toast?.('Please login to reorder tabs', 'info');
                return;
            }
            const idx = tabs.findIndex(t => t.name === tab);
            if (idx === -1) return;
            
            const target = direction === 'left' ? idx - 1 : idx + 1;
            if (target < 0 || target >= tabs.length) return;
            
            const newTabs = [...tabs];
            [newTabs[idx], newTabs[target]] = [newTabs[target], newTabs[idx]];
            setTabs(newTabs);
            
            fetch('/~/api/quickpages/reorder-tabs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabs: newTabs.map(t => t.name) })
            }).catch(e => console.error('reorder:', e));
        };

        // 获取三列显示的 tabs
        const getMultiColumns = useCallback(() => {
            if (!isMultiColumn) return [];
            const activeIdx = tabs.findIndex(t => t.name === activeTab);
            if (activeIdx === -1) return tabs.slice(0, 3);
            
            const result = [];
            for (let i = 0; i < 3; i++) {
                const idx = (activeIdx + i) % tabs.length;
                result.push(tabs[idx]);
            }
            return result;
        }, [isMultiColumn, tabs, activeTab]);

        const multiColumns = useMemo(() => {
            return getMultiColumns();
        }, [getMultiColumns]);

        // ====== 右側分割面板的拖曳分隔條 ======
        const renderPanelResizer = () => {
            if (isMobile || isFullscreen) return null;
            return h('div', {
                className: 'qp-panel-resizer',
                role: 'separator',
                'aria-orientation': 'vertical',
                onPointerDown: handlePanelResizeStart,
                onPointerMove: handlePanelResizeMove,
                onPointerUp: handlePanelResizeEnd,
                onPointerCancel: handlePanelResizeEnd
            },
                h('span', {
                    className: 'qp-panel-resizer-grip',
                    'aria-hidden': 'true',
                    onPointerDown: handlePanelResizeStart,
                    onPointerMove: handlePanelResizeMove,
                    onPointerUp: handlePanelResizeEnd,
                    onPointerCancel: handlePanelResizeEnd
                })
            );
        };

        // ====== 渲染内联 tabs（仅全屏模式使用） ======
        const renderTabsInline = () => {
            return h('div', { 
                className: 'qp-tabs-inline',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    overflowX: 'auto',
                    flex: '1',
                    padding: '0 4px',
                    margin: '0 4px',
                    gap: '0',
                    minWidth: '0'
                }
            },
                tabs.map((tab, i) =>
                    h('span', { key: tab.name, className: 'qp-tab-wrapper-inline', style: { flexShrink: 0 } },
                        i > 0 && h('span', { className: 'qp-tab-sep-inline', style: { color: 'var(--text)', opacity: 0.3, padding: '0 2px' } }, '|'),
                        renamingTab === tab.name ? h('input', {
                            ref: renameInputRef,
                            className: 'qp-tab-rename-input',
                            value: renameValue,
                            onChange: (e) => setRenameValue(e.target.value),
                            onKeyDown: handleRenameKeyDown,
                            onBlur: handleRenameSave,
                            placeholder: tab.name,
                            style: { minWidth: '40px', maxWidth: '120px', padding: '2px 6px', fontSize: '14px' }
                        }) : h('button', {
                            className: `qp-tab-inline ${activeTab === tab.name ? 'qp-tab-active-inline' : ''}`,
                            onClick: () => {
                                setActiveTab(tab.name);
                                if (isMultiColumn) {
                                    const otherTabs = tabs.filter(t => t.name !== tab.name);
                                    otherTabs.forEach(t => loadOtherTabNotes(t));
                                }
                            },
                            onDoubleClick: (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!isGuest) {
                                    handleRenameStart(tab.name);
                                } else {
                                    HFS.toast?.('Please login to rename tabs', 'info');
                                }
                            },
                            title: isGuest ? 'Login to rename' : 'Double-click to rename',
                            style: {
                                padding: '4px 8px',
                                fontSize: '14px',
                                background: 'none',
                                border: activeTab === tab.name ? '1px solid var(--text)' : 'none',
                                borderBottom: activeTab === tab.name ? 'none' : 'none',
                                borderRadius: '0.4em 0.4em 0 0',
                                color: 'var(--text)',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                fontWeight: activeTab === tab.name ? 'bold' : 'normal'
                            }
                        }, getTabDisplayName(tab.name))
                    )
                )
            );
        };

        // ====== 渲染独立的 tabs 行（非全屏模式使用） ======
        const renderTabsStandalone = () => {
            return h('div', { className: 'qp-tabs-container' },
                h('div', { className: 'qp-tabs' },
                    tabs.map((tab, i) =>
                        h('span', { key: tab.name, className: 'qp-tab-wrapper' },
                            i > 0 && h('span', { className: 'qp-tab-sep' }, '|'),
                            renamingTab === tab.name ? h('input', {
                                ref: renameInputRef,
                                className: 'qp-tab-rename-input',
                                value: renameValue,
                                onChange: (e) => setRenameValue(e.target.value),
                                onKeyDown: handleRenameKeyDown,
                                onBlur: handleRenameSave,
                                placeholder: tab.name
                            }) : h('button', {
                                className: `qp-tab ${activeTab === tab.name ? 'qp-tab-active' : ''}`,
                                onClick: () => setActiveTab(tab.name),
                                onDoubleClick: (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!isGuest) {
                                        handleRenameStart(tab.name);
                                    } else {
                                        HFS.toast?.('Please login to rename tabs', 'info');
                                    }
                                },
                                title: isGuest ? 'Login to rename' : 'Double-click to rename'
                            }, getTabDisplayName(tab.name))
                        )
                    )
                ),
                !isGuest && h('div', { className: 'qp-tab-sort' },
                    h('button', {
                        className: 'qp-sort-btn',
                        onClick: () => moveTab(activeTab, 'left'),
                        disabled: tabs.findIndex(t => t.name === activeTab) <= 0,
                        title: 'Move left'
                    }, '◀'),
                    h('button', {
                        className: 'qp-sort-btn',
                        onClick: () => moveTab(activeTab, 'right'),
                        disabled: tabs.findIndex(t => t.name === activeTab) >= tabs.length - 1,
                        title: 'Move right'
                    }, '▶')
                )
            );
        };

        // ====== 如果 tabs 为空，显示提示 ======
        if (tabs.length === 0) {
            return h('div', { 
                className: `qp-panel ${isMobile ? 'qp-mobile' : 'qp-desktop'} ${closing ? 'qp-closing' : ''} ${isFullscreen ? 'qp-fullscreen' : ''}`,
                ref: panelRef,
                style: isFullscreen ? {
                    width: '100%',
                    maxWidth: '100%',
                    height: '100vh',
                    top: 0,
                    left: 0,
                    right: 0,
                    borderLeft: 'none',
                    borderRadius: 0,
                    zIndex: 9999
                } : {}
            },
                renderPanelResizer(),
                h('div', { 
                    className: 'qp-panel-header', 
                    ref: headerRef,
                    style: isFullscreen ? { borderBottom: '1px solid var(--faint-contrast)', padding: '4px 8px', flexShrink: 0 } : {}
                },
                    h('div', { className: 'qp-header-left', style: { flexShrink: 0 } },
                        h('span', { 
                            className: 'qp-panel-title',
                            onClick: toggleFullscreen,
                            style: { cursor: isMobile ? 'default' : 'pointer' },
                            title: isFullscreen ? 'Click to exit fullscreen' : (isMobile ? 'Fullscreen not available on mobile' : 'Click to enter fullscreen')
                        }, isFullscreen ? '※ Pages ✦' : '※ Pages')
                    ),
                    h('div', { className: 'qp-header-right' },
                        h('button', { 
                            className: 'qp-close-btn', 
                            onClick: handleClose,
                            style: { fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: '0 4px' }
                        }, '×')
                    )
                ),
                h('div', { className: 'qp-content', style: isFullscreen ? { flex: 1, overflow: 'hidden' } : {} },
                    h('div', { className: 'qp-empty' }, 
                        isGuest ? 'No public pages available. Please login to access more.' : 'No tabs configured. Add tabs in the admin panel.'
                    )
                )
            );
        }

        return h('div', { 
            className: `qp-panel ${isMobile ? 'qp-mobile' : 'qp-desktop'} ${closing ? 'qp-closing' : ''} ${isFullscreen ? 'qp-fullscreen' : ''}`,
            ref: panelRef,
            style: isFullscreen ? {
                width: '100%',
                maxWidth: '100%',
                height: '100vh',
                top: 0,
                left: 0,
                right: 0,
                borderLeft: 'none',
                borderRadius: 0,
                zIndex: 9999
            } : {}
        },
            renderPanelResizer(),
            // Header 标题行
            h('div', { 
                className: 'qp-panel-header', 
                ref: headerRef,
                style: isFullscreen ? { 
                    borderBottom: '1px solid var(--faint-contrast)',
                    padding: '4px 8px',
                    flexShrink: 0
                } : {}
            },
                h('div', { 
                    className: 'qp-header-left',
                    style: { flexShrink: 0 }
                },
                    h('span', { 
                        className: 'qp-panel-title',
                        onClick: toggleFullscreen,
                        style: { cursor: isMobile ? 'default' : 'pointer' },
                        title: isFullscreen ? 'Click to exit fullscreen' : (isMobile ? 'Fullscreen not available on mobile' : 'Click to enter fullscreen')
                    }, isFullscreen ? '※ Pages ✦' : '※ Pages'),
                    h('button', {
                        className: 'qp-refresh-btn',
                        onClick: handleRefresh,
                        title: 'Refresh current page',
                        disabled: !activeTabData?.url
                    }, '↻')
                ),
                
                // 仅在全屏模式下显示内联 tabs
                isFullscreen && !isMobile && renderTabsInline(),
                
                h('div', { className: 'qp-header-right' },
                    // 全屏模式下显示三列切换按钮
                    isFullscreen && !isMobile && h('button', {
                        className: 'qp-multi-col-btn',
                        onClick: toggleMultiColumn,
                        title: isMultiColumn ? 'Switch to single column' : 'Switch to 3 columns',
                        style: {
                            background: isMultiColumn ? 'var(--text)' : 'none',
                            color: isMultiColumn ? 'var(--bg)' : 'var(--text)',
                            border: '1px solid var(--text)',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            opacity: isMultiColumn ? 1 : 0.6,
                            transition: 'all 0.2s'
                        }
                    }, isMultiColumn ? '▦' : '▢'),
                    isFullscreen && !isMobile && h('span', { 
                        style: { fontSize: '12px', opacity: 0.4, marginRight: '4px' }
                    }, '|'),
                    h('button', { 
                        className: 'qp-close-btn', 
                        onClick: handleClose,
                        style: { fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: '0 4px' }
                    }, '×')
                )
            ),
            
            // 独立的 tabs 行（非全屏模式显示）
            // 移动端始终显示独立 tabs 行
            (!isFullscreen || isMobile) && renderTabsStandalone(),
            
            // 内容区域
            h('div', { 
                className: `qp-content ${isMultiColumn && isFullscreen ? 'qp-content-multi' : ''}`,
                style: isFullscreen ? { flex: 1, overflow: 'hidden' } : {}
            },
                isMultiColumn && isFullscreen && !isMobile ? 
                    // 三列模式
                    h('div', { 
                        className: 'qp-multi-grid',
                        ref: fullscreenGridRef,
                        style: {
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '4px',
                            flex: 1,
                            height: '100%',
                            padding: '4px'
                        }
                    },
                        multiColumns.map((tab, colIdx) => {
                            const isActive = tab.name === activeTab;
                            const tabData = isActive 
                                ? { url: tab.url }
                                : (otherTabData[tab.name] || { url: tab.url, loaded: false });
                            
                            return h('div', { 
                                className: `qp-multi-column ${isActive ? 'qp-multi-column-active' : ''}`,
                                key: tab.name,
                                style: {
                                    display: 'flex',
                                    flexDirection: 'column',
                                    overflow: 'hidden',
                                    borderRadius: '6px',
                                    border: isActive ? '2px solid var(--text)' : '1px solid var(--faint-contrast)',
                                    background: 'var(--bg)'
                                }
                            },
                                h('div', {
                                    className: 'qp-multi-column-header',
                                    style: {
                                        padding: '4px 8px',
                                        borderBottom: '1px solid var(--faint-contrast)',
                                        fontSize: '12px',
                                        fontWeight: isActive ? 'bold' : 'normal',
                                        color: 'var(--text)',
                                        background: isActive ? 'var(--ghost-contrast)' : 'transparent',
                                        flexShrink: 0,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }
                                },
                                    h('span', {}, getTabDisplayName(tab.name)),
                                    !isActive && h('span', { 
                                        style: { fontSize: '10px', opacity: 0.5 }
                                    }, 'view only')
                                ),
                                h('div', {
                                    className: 'qp-multi-column-content',
                                    style: {
                                        flex: 1,
                                        overflow: 'hidden',
                                        position: 'relative'
                                    }
                                },
                                    isActive ? 
                                        (tabData.url ? 
                                            h('iframe', {
                                                ref: isActive ? iframeRef : undefined,
                                                src: tabData.url,
                                                className: 'qp-iframe',
                                                sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
                                                title: getTabDisplayName(tab.name),
                                                style: { width: '100%', height: '100%', border: 'none' }
                                            }) :
                                            h('div', { className: 'qp-empty', style: { padding: '10px', fontSize: '12px' } }, 
                                                'No URL configured'
                                            )
                                        ) :
                                        (tabData.url ? 
                                            h('iframe', {
                                                src: tabData.url,
                                                className: 'qp-iframe',
                                                sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
                                                title: getTabDisplayName(tab.name),
                                                style: { width: '100%', height: '100%', border: 'none', opacity: 1.0 }
                                            }) :
                                            h('div', { className: 'qp-empty', style: { padding: '10px', fontSize: '12px' } }, 
                                                'No URL'
                                            )
                                        )
                                )
                            );
                        })
                    )
                    :
                    // 单列模式
                    (activeTabData && activeTabData.url ? 
                        h('iframe', {
                            ref: iframeRef,
                            src: activeTabData.url,
                            className: 'qp-iframe',
                            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
                            title: getTabDisplayName(activeTab),
                            style: { width: '100%', height: '100%', border: 'none' }
                        }) :
                        h('div', { className: 'qp-empty' }, 
                            activeTabData ? 
                                'No URL configured for this tab. Add a URL in the admin panel.' :
                                'No tabs configured. Add tabs in the admin panel.'
                        )
                    )
            )
        );
    }

    // ====== QuickPageApp - 在框架外渲染 ======
    function QuickPageApp() {
        const { username } = HFS.useSnapState();
        const [show, setShow] = useState(loadQpPanelShow);
        const [hasAccess, setHasAccess] = useState(false);
        const [publicTabs, setPublicTabs] = useState([]);
        const [isGuest, setIsGuest] = useState(false);
        const mountRef = useRef(null);
        const showRef = useRef(false);

        useEffect(() => { showRef.current = show; }, [show]);
        useEffect(() => { saveQpPanelShow(show); }, [show]);

        // ====== 检查访问权限 ======
        useEffect(() => {
            checkAccess().then(result => {
                setHasAccess(result.allowed);
                setPublicTabs(result.publicTabs || []);
                setIsGuest(result.isGuest || false);
            });
        }, []);
        // ====== 访问权限检查结束 ======

        useEffect(() => {
            const fn = () => setShow(prev => !prev);
            window.addEventListener('toggle-quickpages', fn);
            return () => window.removeEventListener('toggle-quickpages', fn);
        }, []);

        // Notes 開啟時會派發 close-quickpages，避免兩個右側面板重疊
        useEffect(() => {
            const close = () => setShow(false);
            window.addEventListener('close-quickpages', close);
            return () => window.removeEventListener('close-quickpages', close);
        }, []);

        // 面板顯示時同步 body class；關閉時立即清掉（React 樹是手動移除的，
        // 不能只依賴 panel 的 effect cleanup）。無權限時也不要讓主界面讓位。
        useEffect(() => {
            if (show && hasAccess) {
                document.body.classList.add('qp-panel-layout', 'qp-panel-open');
            } else {
                document.body.classList.remove('qp-panel-layout', 'qp-panel-open', 'qp-panel-resizing');
            }
            return () => {
                document.body.classList.remove('qp-panel-layout', 'qp-panel-open', 'qp-panel-resizing');
            };
        }, [show, hasAccess]);

        // ====== 使用 createElement 在框架外渲染 ======
        useEffect(() => {
            // 清理之前的挂载点
            if (mountRef.current) {
                if (mountRef.current.parentNode) {
                    document.body.removeChild(mountRef.current);
                }
                mountRef.current = null;
            }

            if (!hasAccess || !show) return;

            // 创建容器 - 全屏透明覆盖层，用于捕获点击关闭
            const container = document.createElement('div');
            container.className = 'qp-overlay';
            container.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                z-index: 10 !important;
                pointer-events: none !important;
                overflow: hidden !important;
                touch-action: none !important;
                margin: 0 !important;
                padding: 0 !important;
                background: transparent !important;
            `;
            document.body.appendChild(container);
            mountRef.current = container;

            try {
                const element = h(QuickPagePanel, { 
                    onClose: () => setShow(false),
                    publicTabs: publicTabs,
                    isGuest: isGuest
                });

                if (HFS.ReactDOM && HFS.ReactDOM.render) {
                    HFS.ReactDOM.render(element, container);
                    console.log('QuickPages: Rendered with ReactDOM.render');
                } else if (HFS.React && HFS.React.render) {
                    HFS.React.render(element, container);
                    console.log('QuickPages: Rendered with React.render');
                } else {
                    renderFallbackUI(container);
                }
            } catch (e) {
                console.error('QuickPages: Render error:', e);
                renderFallbackUI(container);
            }

            function renderFallbackUI(container) {
                const panel = document.createElement('div');
                panel.style.cssText = `
                    position: fixed !important;
                    top: 0 !important;
                    right: 0 !important;
                    width: 480px !important;
                    max-width: 92vw !important;
                    height: 100vh !important;
                    background: #1a1a1a !important;
                    color: #ccc !important;
                    z-index: 10 !important;
                    pointer-events: auto !important;
                    padding: 20px !important;
                    box-sizing: border-box !important;
                    display: flex !important;
                    flex-direction: column !important;
                    box-shadow: -8px 0 40px rgba(0,0,0,0.5) !important;
                `;

                panel.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;padding-bottom:10px;margin-bottom:10px;">
                        <h2 style="margin:0;color:#fff;">Quick Pages</h2>
                        <button onclick="this.closest('.qp-overlay').remove()" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;">\u00D7</button>
                    </div>
                    <div style="flex:1;overflow-y:auto;">
                        <p style="color:#666;text-align:center;padding-top:40px;">
                            ⚠️ React render failed.<br>
                            <span style="font-size:0.85em;">Please check browser console for errors.</span>
                        </p>
                    </div>
                `;

                container.style.pointerEvents = 'none';
                panel.style.pointerEvents = 'auto';
                container.appendChild(panel);

                // 点击背景关闭
                container.addEventListener('click', function(e) {
                    if (e.target === container) {
                        setShow(false);
                    }
                });
            }

            return () => {
                if (mountRef.current && mountRef.current.parentNode) {
                    document.body.removeChild(mountRef.current);
                }
                mountRef.current = null;
            };
        }, [hasAccess, show, publicTabs, isGuest]);
        // ====== 框架外渲染结束 ======

        return null;
    }

    // ====== 按钮始终显示，不受登录状态影响 ======
    HFS.onEvent('appendMenuBar', () => {
        return h('button', {
            className: 'menu-bar-qp-btn',
            onClick() { window.dispatchEvent(new CustomEvent('toggle-quickpages')) },
            title: 'Open Quick Pages'
        }, [
            h('span', { 'aria-hidden': 'true' }, '◳'),
            h('span', { className: 'btn-label' }, 'Pages')
        ]);
    });
    // ====== 按钮始终显示结束 ======

    HFS.onEvent('footer', () => h(QuickPageApp));
}