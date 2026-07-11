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
        const renameInputRef = useRef(null);
        const iframeRef = useRef(null);
        const activeTabRef = useRef(activeTab);
        const headerRef = useRef(null);
        const panelRef = useRef(null); // 【新增】面板引用
        
        useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
        
        // 【新增】处理点击空白区域关闭
        useEffect(() => {
            const handleClickOutside = (e) => {
                if (!panelRef.current || isMobile) return;
                
                const panel = panelRef.current;
                const panelRect = panel.getBoundingClientRect();
                
                // 计算扩展的点击区域（面板外30px）
                const expandedRect = {
                    left: panelRect.left - 30,
                    right: panelRect.right + 30,
                    top: panelRect.top - 30,
                    bottom: panelRect.bottom + 30
                };
                
                // 检查点击是否在扩展区域之外
                if (e.clientX < expandedRect.left || 
                    e.clientX > expandedRect.right || 
                    e.clientY < expandedRect.top || 
                    e.clientY > expandedRect.bottom) {
                    handleClose();
                }
            };
            
            // 延迟添加事件监听，避免立即触发
            const timer = setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
            }, 100);
            
            return () => {
                clearTimeout(timer);
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }, [isMobile, onClose]);
        
        // 【新增】当 activeTab 变化时，保存到 localStorage
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
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }, []);

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

        return h('div', { 
            className: `qp-panel ${isMobile ? 'qp-mobile' : 'qp-desktop'} ${closing ? 'qp-closing' : ''}`,
            ref: panelRef // 【新增】绑定面板引用
        },
            h('div', { className: 'qp-panel-header', ref: headerRef },
                h('div', { className: 'qp-header-left' },
                    h('span', { className: 'qp-panel-title' }, '※ Pages'),
                    h('button', {
                        className: 'qp-refresh-btn',
                        onClick: handleRefresh,
                        title: 'Refresh current page',
                        disabled: !activeTabData?.url
                    }, '↻')
                ),
                h('div', { className: 'qp-header-right' },
                    h('button', { className: 'qp-close-btn', onClick: handleClose }, '×')
                )
            ),
            
            h('div', { className: 'qp-tabs-container' },
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
            ),
            
            h('div', { className: 'qp-content' },
                activeTabData && activeTabData.url ? 
                    h('iframe', {
                        ref: iframeRef,
                        src: activeTabData.url,
                        className: 'qp-iframe',
                        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
                        title: getTabDisplayName(activeTab)
                    }) :
                    h('div', { className: 'qp-empty' }, 
                        activeTabData ? 
                            'No URL configured for this tab. Add a URL in the admin panel.' :
                            'No tabs configured. Add tabs in the admin panel.'
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