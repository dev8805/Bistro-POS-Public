const fs = require('fs');
let content = fs.readFileSync('components/Sidebar.tsx', 'utf8');

// Mobile Nav
const mobilePattern = /\{\/\* Main Navigation \*\/\}[\s\S]*?(?=\{\/\* -+ \*\/\}\s*\{\/\* VIEW: SETTINGS SUB-MENU \*\/\})/g;
const mobileReplacement = `{/* Main Navigation */}
                <nav className="flex-1 overflow-y-auto pt-3 pb-4 px-3 space-y-0.5 custom-scrollbar">
                  {[
                    { section: 'Operaciones', isSection: true, access: true },
                    { access: true, screen: Screen.SELL, label: 'Punto de Venta', icon: 'payments', isActive: isActive(Screen.SELL) || isActive(Screen.TABLES) || isActive(Screen.QUICK_ORDER) },
                    { access: canAccessScreen(Screen.SALES), screen: Screen.SALES, label: 'Historial de ventas', icon: 'receipt_long', isActive: isActive(Screen.SALES) },
                    { section: 'Gestión', isSection: true, access: canAccessScreen(Screen.PRODUCTS) || canAccessScreen(Screen.INVENTORY) || canAccessScreen(Screen.DASHBOARD) },
                    { access: canAccessScreen(Screen.PRODUCTS), screen: Screen.PRODUCTS, label: 'Productos', icon: 'shopping_bag', isActive: isActive(Screen.PRODUCTS) },
                    { access: canAccessScreen(Screen.INVENTORY), screen: Screen.INVENTORY, label: 'Inventario', icon: 'inventory', isActive: isActive(Screen.INVENTORY) },
                    { access: canAccessScreen(Screen.DASHBOARD), screen: Screen.DASHBOARD, label: 'Estadísticas', icon: 'grid_view', isActive: isActive(Screen.DASHBOARD) },
                    { section: 'Finanzas', isSection: true, access: canAccessScreen(Screen.CLIENTS) || canAccessScreen(Screen.DEBTS) },
                    { access: canAccessScreen(Screen.CLIENTS), screen: Screen.CLIENTS, label: 'Cuentas por Cobrar', icon: 'groups', isActive: isActive(Screen.CLIENTS) },
                    { access: canAccessScreen(Screen.DEBTS), screen: Screen.DEBTS, label: 'Cuentas por Pagar', icon: 'account_balance_wallet', isActive: isActive(Screen.DEBTS) },
                    { section: 'Equipo', isSection: true, access: canAccessScreen(Screen.EMPLOYEES) || true },
                    { access: canAccessScreen(Screen.EMPLOYEES), screen: Screen.EMPLOYEES, label: 'Personal', icon: 'badge', isActive: isActive(Screen.EMPLOYEES) },
                    { access: true, screen: Screen.TRAINING, label: 'Capacitación', icon: 'school', isActive: isActive(Screen.TRAINING) },
                    { section: 'Caja', isSection: true, access: canAccessScreen(Screen.CASH_REGISTER) },
                    { access: canAccessScreen(Screen.CASH_REGISTER), screen: Screen.CASH_REGISTER, label: 'Caja', icon: 'point_of_sale', isActive: isActive(Screen.CASH_REGISTER) }
                  ]
                    .filter(item => item.access)
                    .map((item, index) => {
                      if (item.isSection) {
                        return (
                          <div key={\`msec-\${index}\`} className="px-3 pt-5 pb-1">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{item.section}</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={item.screen}
                          onClick={() => handleMobileNavigate(item.screen as Screen)}
                          className={\`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-colors \${item.isActive ? 'bg-primary/5 text-primary-text dark:bg-primary/10 dark:text-primary font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.02)]' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 hover:text-gray-900 dark:hover:bg-gray-800'}\`}
                        >
                          <span className={\`material-symbols-outlined text-[20px] transition-colors \${item.isActive ? 'text-primary' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}\`}>{item.icon}</span>
                          <span className={\`text-[14px] tracking-tight whitespace-nowrap \${item.isActive ? 'font-semibold' : 'font-medium'}\`}>{item.label}</span>
                        </button>
                      );
                    })}

                  {hasPermission('admin_settings') && (
                    <>
                      <div className="my-2 border-t border-gray-100 dark:border-gray-800 opacity-50 mx-2" />
                      <button
                        onClick={() => setActiveMobilePanel('settings')}
                        className="w-full px-4 py-2.5 rounded-xl flex items-center justify-between transition-all text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-800 group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-[20px] text-gray-400 group-hover:text-emerald-600 transition-colors">settings</span>
                          <span className="text-[14px] tracking-tight font-medium whitespace-nowrap">Configuración</span>
                        </div>
                        <span className="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                      </button>
                    </>
                  )}
                </nav>
              </div>
            )}
`;

content = content.replace(mobilePattern, mobileReplacement);


const desktopPattern = /\{\/\* Scrollable Nav Area \*\/\}[\s\S]*?(?=\{\/\* Desktop Profile Section |<div className=\{\`mt-auto flex flex-col gap-2 relative px-2\`\}>)/g;
const desktopReplacement = `{/* Scrollable Nav Area */}
            <div className="flex-1 overflow-y-auto overflow-x-visible custom-scrollbar px-3 pt-2 pb-2">
              <nav className="flex flex-col gap-0.5 w-full">
                {[
                  { section: 'Operaciones', isSection: true, access: true },
                  {
                    access: true,
                    screen: Screen.SELL,
                    label: 'Punto de Venta',
                    icon: 'payments',
                    isActive: isActive(Screen.SELL) || isActive(Screen.QUICK_ORDER)
                  },
                  {
                    access: canAccessScreen(Screen.SALES),
                    screen: Screen.SALES,
                    label: 'Historial de ventas',
                    icon: 'receipt_long',
                    isActive: isActive(Screen.SALES),
                    prefetchObj: 'sales'
                  },
                  { section: 'Gestión', isSection: true, access: canAccessScreen(Screen.PRODUCTS) || canAccessScreen(Screen.INVENTORY) || canAccessScreen(Screen.DASHBOARD) },
                  {
                    access: canAccessScreen(Screen.PRODUCTS),
                    screen: Screen.PRODUCTS,
                    label: 'Productos',
                    icon: 'shopping_bag',
                    isActive: isActive(Screen.PRODUCTS),
                    prefetchObj: 'products'
                  },
                  {
                    access: canAccessScreen(Screen.INVENTORY),
                    screen: Screen.INVENTORY,
                    label: 'Inventario',
                    icon: 'inventory',
                    isActive: isActive(Screen.INVENTORY),
                    prefetchObj: 'inventory'
                  },
                  {
                    access: canAccessScreen(Screen.DASHBOARD),
                    screen: Screen.DASHBOARD,
                    label: 'Estadísticas',
                    icon: 'grid_view',
                    isActive: isActive(Screen.DASHBOARD),
                    prefetchObj: 'dashboard'
                  },
                  { section: 'Finanzas', isSection: true, access: canAccessScreen(Screen.CLIENTS) || canAccessScreen(Screen.DEBTS) },
                  {
                    access: canAccessScreen(Screen.CLIENTS),
                    screen: Screen.CLIENTS,
                    label: 'Cuentas por Cobrar',
                    icon: 'groups',
                    isActive: isActive(Screen.CLIENTS),
                    prefetchObj: 'clients'
                  },
                  {
                    access: canAccessScreen(Screen.DEBTS),
                    screen: Screen.DEBTS,
                    label: 'Cuentas por Pagar',
                    icon: 'account_balance_wallet',
                    isActive: isActive(Screen.DEBTS),
                    prefetchObj: 'debts'
                  },
                  { section: 'Equipo', isSection: true, access: canAccessScreen(Screen.EMPLOYEES) || true },
                  {
                    access: canAccessScreen(Screen.EMPLOYEES),
                    screen: Screen.EMPLOYEES,
                    label: 'Personal',
                    icon: 'badge',
                    isActive: isActive(Screen.EMPLOYEES),
                    prefetchObj: 'employees'
                  },
                  {
                    access: true,
                    screen: Screen.TRAINING,
                    label: 'Capacitación',
                    icon: 'school',
                    isActive: isActive(Screen.TRAINING)
                  },
                  { section: 'Caja', isSection: true, access: canAccessScreen(Screen.CASH_REGISTER) },
                  {
                    access: canAccessScreen(Screen.CASH_REGISTER),
                    screen: Screen.CASH_REGISTER,
                    label: 'Caja',
                    icon: 'point_of_sale',
                    isActive: isActive(Screen.CASH_REGISTER)
                  }
                ]
                  .filter(item => item.access)
                  .map((item, index) => {
                    if (item.isSection) {
                      return (
                        <div key={\`sec-\${index}\`} className="px-3 pt-5 pb-1">
                          <span className="text-[10px] font-bold text-gray-400/80 dark:text-gray-500 uppercase tracking-widest leading-none">{item.section}</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={item.screen}
                        onClick={() => handleDesktopNavigate(item.screen as Screen)}
                        onMouseEnter={() => item.prefetchObj && prefetchScreen(item.prefetchObj as any)}
                        className={\`group flex items-center gap-3 py-2 rounded-xl px-3 justify-start transition-all duration-200 animate-slideInUpSubtle \${item.isActive ? 'bg-primary/5 text-primary-text dark:bg-primary/10 dark:text-primary font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.02)]' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 hover:text-gray-900 dark:hover:bg-gray-800'}\`}
                        style={{ animationDelay: \`\${index * 15}ms\` }}
                      >
                        <span className={\`material-symbols-outlined text-[20px] shrink-0 transition-colors \${item.isActive ? 'text-primary' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}\`}>{item.icon}</span>
                        <span className={\`font-medium whitespace-nowrap overflow-hidden text-ellipsis transition-opacity duration-150 text-[13.5px] \${item.isActive ? 'font-semibold' : ''}\`}>
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
              </nav>
            </div>

`;
content = content.replace(desktopPattern, desktopReplacement);

// Desktop profile section
content = content.replace(/<div className="shrink-0 relative px-2 mb-1 z-\[70\] overflow-visible"/, '<div className="shrink-0 relative px-3 py-2 border-b border-gray-100 dark:border-gray-800/80 mb-1 z-[70] overflow-visible"');

// Desktop Adjust menu
content = content.replace(/<div className=\{\`mt-auto flex flex-col gap-2 relative px-2\`\}>/, '<div className={`mt-auto flex flex-col gap-2 relative px-3 pb-3 pt-2`}><div className="mx-3 border-t border-gray-100 dark:border-gray-800" />');
content = content.replace(/className=\{\`w-full flex items-center gap-3 py-2\.5 rounded-xl text-text-secondary hover:text-text-main hover:bg-gray-100 dark:hover:bg-gray-800 transition-all px-2 justify-start \$\{showSettingsMenu \? 'bg-gray-100 dark:bg-gray-800 font-bold text-text-main dark:text-white' : ''\}\`\}/, 'className={`w-full flex items-center gap-3 py-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100/80 dark:hover:bg-gray-800 transition-all px-3 justify-start group ${showSettingsMenu ? "bg-gray-100 dark:bg-gray-800 font-semibold text-gray-900 dark:text-white" : ""}`}');
content = content.replace(/<span className="material-symbols-outlined text-\[24px\] shrink-0">settings<\/span>/, '<span className="material-symbols-outlined text-[20px] shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors">settings</span>');
content = content.replace(/<span className="text-\[14\.5px\] font-medium whitespace-nowrap">/, '<span className="text-[13.5px] font-medium whitespace-nowrap">');

fs.writeFileSync('components/Sidebar.tsx', content, 'utf8');
console.log('Sidebar refactored.');
