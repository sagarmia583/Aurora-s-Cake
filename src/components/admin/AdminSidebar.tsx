import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  ChefHat,
  Package,
  Truck,
  TruckIcon,
  DollarSign,
  Users,
  Cake,
  Gift,
  UserCog,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Menu,
  X,
  Store,
  PackageOpen,
} from 'lucide-react';
import type { StaffRole } from '../../types';

export type AdminModuleKey =
  | 'dashboard'
  | 'orders'
  | 'pos'
  | 'kitchen'
  | 'inventory'
  | 'purchases'
  | 'delivery'
  | 'finance'
  | 'customers'
  | 'products'
  | 'offers'
  | 'staff'
  | 'reports'
  | 'settings';

interface NavItem {
  key: AdminModuleKey;
  label: string;
  bangla: string;
  icon: React.ReactNode;
  roles: StaffRole[]; // which roles can see this
  badge?: number;
}

interface AdminSidebarProps {
  activeModule: AdminModuleKey;
  onModuleChange: (module: AdminModuleKey) => void;
  role: StaffRole;
  staffName: string;
  staffAvatar?: string;
  onSignOut?: () => void;
  pendingOrdersCount?: number;
  pendingApprovalsCount?: number;
  lowStockCount?: number;
}

const ALL_NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    bangla: 'ড্যাশবোর্ড',
    icon: <LayoutDashboard size={18} />,
    roles: ['super_admin', 'admin', 'order_manager', 'kitchen_manager', 'delivery_manager', 'accountant', 'delivery_man'],
  },
  {
    key: 'orders',
    label: 'Orders',
    bangla: 'অর্ডার',
    icon: <ShoppingBag size={18} />,
    roles: ['super_admin', 'admin', 'order_manager', 'kitchen_manager', 'delivery_manager'],
  },
  {
    key: 'pos',
    label: 'POS / Sales',
    bangla: 'বিক্রয়',
    icon: <ShoppingCart size={18} />,
    roles: ['super_admin', 'admin', 'order_manager'],
  },
  {
    key: 'kitchen',
    label: 'Kitchen',
    bangla: 'কিচেন',
    icon: <ChefHat size={18} />,
    roles: ['super_admin', 'admin', 'kitchen_manager', 'order_manager'],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    bangla: 'স্টক',
    icon: <Package size={18} />,
    roles: ['super_admin', 'admin', 'order_manager'],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    bangla: 'ক্রয়',
    icon: <PackageOpen size={18} />,
    roles: ['super_admin', 'admin', 'order_manager'],
  },
  {
    key: 'delivery',
    label: 'Delivery',
    bangla: 'ডেলিভারি',
    icon: <TruckIcon size={18} />,
    roles: ['super_admin', 'admin', 'delivery_manager', 'order_manager', 'delivery_man'],
  },
  {
    key: 'finance',
    label: 'Finance',
    bangla: 'হিসাব',
    icon: <DollarSign size={18} />,
    roles: ['super_admin', 'admin', 'accountant'],
  },
  {
    key: 'customers',
    label: 'Customers',
    bangla: 'কাস্টমার',
    icon: <Users size={18} />,
    roles: ['super_admin', 'admin', 'order_manager'],
  },
  {
    key: 'products',
    label: 'Products',
    bangla: 'পণ্য',
    icon: <Cake size={18} />,
    roles: ['super_admin', 'admin', 'order_manager'],
  },
  {
    key: 'offers',
    label: 'Offers & Coupons',
    bangla: 'অফার',
    icon: <Gift size={18} />,
    roles: ['super_admin', 'admin', 'order_manager'],
  },
  {
    key: 'staff',
    label: 'Staff',
    bangla: 'স্টাফ',
    icon: <UserCog size={18} />,
    roles: ['super_admin', 'admin'],
  },
  {
    key: 'reports',
    label: 'Reports',
    bangla: 'রিপোর্ট',
    icon: <BarChart3 size={18} />,
    roles: ['super_admin', 'admin', 'accountant', 'order_manager'],
  },
  {
    key: 'settings',
    label: 'Settings',
    bangla: 'সেটিংস',
    icon: <Settings size={18} />,
    roles: ['super_admin', 'admin'],
  },
];

function getBadge(key: AdminModuleKey, pendingOrders: number, pendingApprovals: number, lowStock: number): number | undefined {
  if (key === 'orders' && pendingOrders > 0) return pendingOrders;
  if (key === 'finance' && pendingApprovals > 0) return pendingApprovals;
  if (key === 'inventory' && lowStock > 0) return lowStock;
  return undefined;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeModule,
  onModuleChange,
  role,
  staffName,
  staffAvatar,
  onSignOut,
  pendingOrdersCount = 0,
  pendingApprovalsCount = 0,
  lowStockCount = 0,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = ALL_NAV_ITEMS.filter(item => item.roles.includes(role));

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg, #2D1B1E 0%, #1a1012 100%)' }}>
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-base font-bold shadow-lg"
          style={{ background: 'linear-gradient(135deg, #B77D80, #8B5254)' }}
        >
          A
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-white font-bold text-sm leading-tight truncate">Aurora's Cake</div>
            <div className="text-white/50 text-xs truncate">Admin Panel</div>
          </div>
        )}
        {/* Desktop collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto hidden lg:flex items-center justify-center w-6 h-6 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const badge = getBadge(item.key, pendingOrdersCount, pendingApprovalsCount, lowStockCount);
          const isActive = activeModule === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { onModuleChange(item.key); setMobileOpen(false); }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group relative
                ${isActive
                  ? 'text-white shadow-md'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                }
              `}
              style={isActive ? { background: 'linear-gradient(135deg, #B77D80, #9B6568)' } : {}}
              title={collapsed ? `${item.label} — ${item.bangla}` : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium leading-tight">{item.label}</span>
                    <span className="block text-xs opacity-70 leading-tight">{item.bangla}</span>
                  </span>
                  {badge !== undefined && badge > 0 && (
                    <span className="flex-shrink-0 min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && badge !== undefined && badge > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Staff Info + Sign Out */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-white/20 flex items-center justify-center">
            {staffAvatar ? (
              <img src={staffAvatar} alt={staffName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-sm font-bold">{staffName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">{staffName}</div>
              <div className="text-white/50 text-[10px] capitalize">{role.replace(/_/g, ' ')}</div>
            </div>
          )}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="flex-shrink-0 text-white/40 hover:text-red-400 transition-colors p-1 rounded"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-xl shadow-lg text-white flex items-center justify-center"
        style={{ background: '#B77D80' }}
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 z-50">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 z-10 text-white/60 hover:text-white"
            >
              <X size={20} />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col h-screen sticky top-0 flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-16' : 'w-56'}`}
      >
        {sidebarContent}
      </aside>
    </>
  );
};
