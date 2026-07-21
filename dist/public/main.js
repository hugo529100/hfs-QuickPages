"use strict"; {
    const { h } = HFS;
    const { useState, useEffect, useRef, useMemo, useCallback } = HFS.React;

    function QuickPagePanel({ onClose }) {
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
        
        useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
        useEffect(() => { isFullscreenRef.current = isFullscreen; }, [isFullscreen]);
        
        // 处理点击空白区域关闭（非全屏模式）
        useEffect(() => {
            const handleClickOutside = (e) => {
                if (!panelRef.current || isMobile || isFullscreenRef.current) return;
                
                const panel = panelRef.current;
                const panelRect = panel.getBoundingClientRect();
                
                const expandedRect = {
                    left: panelRect.left - 30,
                    right: panelRect.right + 30,
                    top: panelRect.top - 30,
                    bottom: panelRect.bottom + 30
                };
                
                if (e.clientX < expandedRect.left || 
                    e.clientX > expandedRect.right || 
                    e.clientY < expandedRect.top || 
                    e.clientY > expandedRect.bottom) {
                    handleClose();
                }
            };
            
            const timer = setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
            }, 100);
            
            return () => {
                clearTimeout(timer);
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }, [isMobile, onClose]);
        
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

        // 全屏模式切换
        const toggleFullscreen = useCallback(() => {
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
        }, []);

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
                // 加载其他 tab 的数据
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

        const handleClose = () => {
            setClosing(true);
            if (isFullscreenRef.current) {
                document.exitFullscreen?.().catch(() => {});
            }
            setTimeout(onClose, 300);
        };

        const handleRefresh = () => {
            if (iframeRef.current) {
                iframeRef.current.src = iframeRef.current.src;
            }
        };

        const handleRenameStart = (tab) => {
            setRenamingTab(tab);
            setRenameValue(tabNames[tab] || '');
        };

        const handleRenameSave = async () => {
            if (!renamingTab) return;
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

        useEffect(() => {
            const originalOverflow = document.body.style.overflow;
            if (!isFullscreenRef.current) {
                document.body.style.overflow = 'hidden';
            }
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }, []);

        // 全屏模式下 body 滚动控制
        useEffect(() => {
            if (isFullscreen) {
                document.body.style.overflow = '';
            } else {
                document.body.style.overflow = 'hidden';
            }
        }, [isFullscreen]);

        const loadTabs = useCallback(() => {
            fetch('/~/api/quickpages/tabs')
                .then(r => r.json())
                .then(data => {
                    setTabs(data.tabs || []);
                    setTabNames(data.tabNames || {});
                    
                    const savedTab = localStorage.getItem('quickpages-active-tab');
                    const availableTabNames = (data.tabs || []).map(t => t.name);
                    
                    if (savedTab && availableTabNames.includes(savedTab)) {
                        setActiveTab(savedTab);
                    } else if (data.tabs?.length > 0 && !activeTabRef.current) {
                        setActiveTab(data.tabs[0].name);
                    } else if (data.tabs?.length > 0 && !data.tabs.find(t => t.name === activeTabRef.current)) {
                        setActiveTab(data.tabs[0].name);
                    }
                })
                .catch(e => console.error('load tabs:', e));
        }, []);

        useEffect(() => {
            loadTabs();
        }, []);

        useEffect(() => {
            try {
                const es = HFS.getNotifications('quickpages', (e, data) => {
                    if (!data) return;
                    
                    if (e === 'tabsReordered') {
                        if (data.tabs && Array.isArray(data.tabs)) {
                            const currentTabs = tabs;
                            const orderedTabs = data.tabs.map(name => 
                                currentTabs.find(t => t.name === name) || { name, url: '' }
                            ).filter(Boolean);
                            setTabs(orderedTabs);
                            if (!data.tabs.includes(activeTabRef.current)) {
                                setActiveTab(data.tabs[0] || '');
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
        }, []);

        const activeTabData = useMemo(() => {
            return tabs.find(t => t.name === activeTab) || null;
        }, [tabs, activeTab]);

        const moveTab = (tab, direction) => {
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

        // 渲染内联 tabs（仅全屏模式使用）
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
                                    // 切换时重新加载其他列
                                    const otherTabs = tabs.filter(t => t.name !== tab.name);
                                    otherTabs.forEach(t => loadOtherTabNotes(t));
                                }
                            },
                            onDoubleClick: (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRenameStart(tab.name);
                            },
                            title: 'Double-click to rename',
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

        // 渲染独立的 tabs 行（非全屏模式使用）
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
                                    handleRenameStart(tab.name);
                                },
                                title: 'Double-click to rename'
                            }, getTabDisplayName(tab.name))
                        )
                    )
                ),
                h('div', { className: 'qp-tab-sort' },
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
                        style: { cursor: 'pointer' },
                        title: isFullscreen ? 'Click to exit fullscreen' : 'Click to enter fullscreen'
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
                                                style: { width: '100%', height: '100%', border: 'none', opacity: 0.7 }
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

    function QuickPageApp() {
        const { username } = HFS.useSnapState();
        const [show, setShow] = useState(false);

        useEffect(() => {
            const fn = () => setShow(prev => !prev);
            window.addEventListener('toggle-quickpages', fn);
            return () => window.removeEventListener('toggle-quickpages', fn);
        }, []);

        if (!username || !show) return null;

        return h('div', {
            className: 'qp-overlay'
        }, h(QuickPagePanel, { onClose: () => setShow(false) }));
    }

    if (HFS.state.username) {
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
    }

    HFS.onEvent('footer', () => h(QuickPageApp));
}