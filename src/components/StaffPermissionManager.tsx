import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  Users, 
  Key, 
  Check, 
  X, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  Filter, 
  Sliders, 
  RotateCcw, 
  Lock, 
  Unlock, 
  Info,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  ShoppingBag,
  ChefHat,
  Truck,
  Calculator,
  Tag,
  Settings,
  BarChart3,
  FileText,
  Save,
  History,
  Bike,
  DollarSign,
  Clock,
  User
} from 'lucide-react';
import { 
  StaffMember, 
  StaffRole, 
  StaffPermissionCode, 
  PermissionCategory 
} from '../types';
import { 
  ALL_STAFF_PERMISSIONS, 
  DEFAULT_ROLE_PERMISSIONS, 
  ROLE_METADATA, 
  CATEGORY_LABELS,
  getPermissionsByCategory 
} from '../services/staffPermissions';
import { mockDb } from '../services/mockDatabase';

interface StaffPermissionManagerProps {
  currentRole: StaffRole;
  actorName?: string;
  onPermissionsUpdated?: () => void;
}

export const StaffPermissionManager: React.FC<StaffPermissionManagerProps> = ({
  currentRole,
  actorName = 'Super Admin',
  onPermissionsUpdated,
}) => {
  const [staffList, setStaffList] = useState<StaffMember[]>(() => mockDb.getStaffMembers());
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [activeSubTab, setActiveSubTab] = useState<'members' | 'presets'>('members');
  
  // Modal states
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<StaffPermissionCode[]>([]);
  const [editingRoleTarget, setEditingRoleTarget] = useState<StaffRole | null>(null);
  const [isRolePresetModalOpen, setIsRolePresetModalOpen] = useState(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [viewingStaffHistory, setViewingStaffHistory] = useState<StaffMember | null>(null);
  const [staffHistorySearch, setStaffHistorySearch] = useState('');
  
  // Feedback message
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New staff form state
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('1234');
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>('order_manager');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPermissions, setNewStaffPermissions] = useState<StaffPermissionCode[]>([
    ...DEFAULT_ROLE_PERMISSIONS.order_manager,
  ]);

  // Reset password modal state
  const [resetPasswordStaff, setResetPasswordStaff] = useState<StaffMember | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  // Sync with mockDb updates
  useEffect(() => {
    const unsubscribe = mockDb.subscribe(() => {
      setStaffList(mockDb.getStaffMembers());
    });
    return () => unsubscribe();
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((staff) => {
      const matchesSearch = 
        staff.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        staff.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (staff.phone && staff.phone.includes(searchQuery)) ||
        (staff.email && staff.email.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === 'all' || staff.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [staffList, searchQuery, roleFilter]);

  // Permissions grouped by category
  const permissionsByCategory = useMemo(() => getPermissionsByCategory(), []);

  // Handle open permission modal for a staff member
  const handleOpenPermissionModal = (staff: StaffMember) => {
    setEditingStaff(staff);
    setSelectedPermissions([...staff.permissions]);
  };

  // Handle toggle single permission
  const handleTogglePermission = (code: StaffPermissionCode) => {
    if ((editingStaff?.role === 'super_admin' || editingStaff?.role === 'admin') && code === 'staff.manage') {
      showToast('অ্যাডমিন বা সুপার অ্যাডমিনের জন্য স্টাফ ম্যানেজমেন্ট পারমিশন বন্ধ করা যাবে না।', 'error');
      return;
    }
    setSelectedPermissions((prev) => 
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Toggle all in a category
  const handleToggleCategory = (category: PermissionCategory) => {
    const categoryPerms = permissionsByCategory[category]?.map((p) => p.code) || [];
    const allSelected = categoryPerms.every((code) => selectedPermissions.includes(code));
    
    if (allSelected) {
      // Unselect all in category
      setSelectedPermissions((prev) => 
        prev.filter((c) => !categoryPerms.includes(c))
      );
    } else {
      // Select all in category
      const toAdd = categoryPerms.filter((code) => !selectedPermissions.includes(code));
      setSelectedPermissions((prev) => [...prev, ...toAdd]);
    }
  };

  // Apply a preset to the active modal
  const handleApplyPreset = (role: StaffRole) => {
    const preset = mockDb.getRolePermissions(role);
    setSelectedPermissions([...preset]);
    showToast(`"${ROLE_METADATA[role].banglaTitle}" প্রিসেটের ${preset.length}টি পারমিশন সিলেক্ট করা হয়েছে।`);
  };

  // Save staff permissions
  const handleSavePermissions = () => {
    if (!editingStaff) return;
    const success = mockDb.updateStaffPermissions(editingStaff.id, selectedPermissions, actorName);
    if (success) {
      showToast(`${editingStaff.name}-এর জন্য ${selectedPermissions.length}টি পারমিশন সফলভাবে সংরক্ষিত হয়েছে!`);
      setEditingStaff(null);
      if (onPermissionsUpdated) onPermissionsUpdated();
    } else {
      showToast('পারমিশন সংরক্ষণ করা যায়নি।', 'error');
    }
  };

  // Toggle staff active status
  const handleToggleActive = (staff: StaffMember) => {
    if (staff.role === 'super_admin') {
      showToast('সুপার অ্যাডমিন অ্যাকাউন্ট নিষ্ক্রিয় করা যাবে না।', 'error');
      return;
    }
    const newStatus = !staff.is_active;
    mockDb.updateStaffMember(staff.id, { is_active: newStatus }, actorName);
    showToast(`${staff.name} এখন ${newStatus ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয় (Disabled)'}!`);
  };

  // Delete staff
  const handleDeleteStaff = (staff: StaffMember) => {
    if (staff.role === 'super_admin') {
      showToast('সুপার অ্যাডমিন অ্যাকাউন্ট ডিলিট করা সম্ভব নয়।', 'error');
      return;
    }
    if (window.confirm(`আপনি কি নিশ্চিত যে "${staff.name}"-এর স্টাফ অ্যাকাউন্ট মুছে ফেলতে চান?`)) {
      mockDb.deleteStaffMember(staff.id, actorName);
      showToast(`${staff.name}-এর অ্যাকাউন্ট সফলভাবে মুছে ফেলা হয়েছে।`);
    }
  };

  // Create new staff
  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffUsername.trim()) {
      showToast('নাম এবং ইউজারনেম পূরণ করা বাধ্যতামূলক।', 'error');
      return;
    }

    // Check username duplication
    const cleanUsername = newStaffUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const exists = staffList.some((s) => s.username.toLowerCase() === cleanUsername);
    if (exists) {
      showToast(`@${cleanUsername} ইউজারনেমটি ইতিমধ্যে বিদ্যমান। অন্য একটি দিন।`, 'error');
      return;
    }

    if (newStaffPassword.trim().length < 4) {
      showToast('স্টাফ পাসওয়ার্ড নূন্যতম ৪ ডিজিট বা ক্যারেক্টার হতে হবে।', 'error');
      return;
    }

    mockDb.addStaffMember({
      name: newStaffName.trim(),
      username: cleanUsername,
      password: newStaffPassword.trim(),
      role: newStaffRole,
      phone: newStaffPhone.trim() || undefined,
      email: newStaffEmail.trim() || undefined,
      permissions: newStaffPermissions,
      is_active: true,
    }, actorName);

    showToast(`নতুন স্টাফ "${newStaffName}" (@${cleanUsername}) সফলভাবে যুক্ত হয়েছে!`);
    setShowAddStaffModal(false);
    setNewStaffName('');
    setNewStaffUsername('');
    setNewStaffPassword('1234');
    setNewStaffPhone('');
    setNewStaffEmail('');
    setNewStaffRole('order_manager');
    setNewStaffPermissions([...DEFAULT_ROLE_PERMISSIONS.order_manager]);
    if (onPermissionsUpdated) onPermissionsUpdated();
  };

  // Handle staff password reset
  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordStaff) return;
    if (resetPasswordValue.trim().length < 4) {
      showToast('পাসওয়ার্ড নূন্যতম ৪ ডিজিট বা ক্যারেক্টার হতে হবে।', 'error');
      return;
    }
    try {
      mockDb.resetStaffPassword(resetPasswordStaff.id, resetPasswordValue.trim(), actorName);
      showToast(`"${resetPasswordStaff.name}"-এর লগইন পাসওয়ার্ড সফলভাবে আপডেট হয়েছে!`);
      setResetPasswordStaff(null);
      setResetPasswordValue('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'পাসওয়ার্ড আপডেট ব্যর্থ হয়েছে।', 'error');
    }
  };

  // Handle role preset editing
  const handleOpenRolePresetModal = (role: StaffRole) => {
    setEditingRoleTarget(role);
    setSelectedPermissions(mockDb.getRolePermissions(role));
    setIsRolePresetModalOpen(true);
  };

  // Save role preset
  const handleSaveRolePreset = () => {
    if (!editingRoleTarget) return;
    mockDb.updateRolePermissions(editingRoleTarget, selectedPermissions, actorName);
    showToast(`"${ROLE_METADATA[editingRoleTarget].banglaTitle}" রোলের ডিফল্ট পারমিশন সফলভাবে আপডেট হয়েছে!`);
    setIsRolePresetModalOpen(false);
    setEditingRoleTarget(null);
    if (onPermissionsUpdated) onPermissionsUpdated();
  };

  // Reset to factory defaults
  const handleResetToDefaults = () => {
    if (window.confirm('আপনি কি নিশ্চিত যে সকল স্টাফ ও রোল পারমিশন ফ্যাক্টরি ডিফল্টে রিসেট করতে চান?')) {
      mockDb.resetStaffToDefaults(actorName);
      setStaffList(mockDb.getStaffMembers());
      showToast('সকল স্টাফ ও পারমিশন সফলভাবে ফ্যাক্টরি ডিফল্টে রিসেট হয়েছে!');
      if (onPermissionsUpdated) onPermissionsUpdated();
    }
  };

  // Check category icons
  const getCategoryIcon = (category: PermissionCategory) => {
    switch (category) {
      case 'orders': return ShoppingBag;
      case 'kitchen': return ChefHat;
      case 'delivery': return Truck;
      case 'products': return Layers;
      case 'costing': return Calculator;
      case 'coupons': return Tag;
      case 'custom_cakes': return Sparkles;
      case 'settings': return Settings;
      case 'analytics': return BarChart3;
      case 'audit': return FileText;
      case 'staff': return Shield;
      default: return ShieldCheck;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedbackMessage && (
        <div 
          role="alert" 
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-sm font-bold transition-all ${
            feedbackMessage.type === 'success' 
              ? 'bg-emerald-900 text-emerald-100 border-emerald-700' 
              : 'bg-rose-900 text-rose-100 border-rose-700'
          }`}
        >
          {feedbackMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-indigo-900/60 shadow-xl text-white">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                Super Admin Authority
              </span>
              <span className="text-xs text-slate-400">রোল-ভিত্তিক পারমিশন নিয়ন্ত্রণ</span>
            </div>
            <h2 className="text-2xl font-black text-white">
              স্টাফ দায়িত্ব ও পারমিশন কন্ট্রোল (Staff & Roles)
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              সুপার অ্যাডমিন হিসেবে আপনি নির্ধারণ করতে পারবেন কোন স্টাফ কোন বিভাগে কাজ করতে পারবেন, 
              কে অর্ডার কনফার্ম করবেন, কে কিচেন বা ডেলিভারি হ্যান্ডেল করবেন, কে কেকের কস্টিং বা প্রফিট দেখতে পাবেন এবং কে সেটিংস পরিবর্তন করতে পারবেন।
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAddStaffModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-900/40 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন স্টাফ যোগ করুন</span>
            </button>
            <button
              onClick={handleResetToDefaults}
              className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
              title="সকল পারমিশন ফ্যাক্টরি ডিফল্টে ফিরিয়ে নিন"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ডিফল্ট রিসেট</span>
            </button>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="mt-6 flex gap-2 border-t border-indigo-900/60 pt-4">
          <button
            onClick={() => setActiveSubTab('members')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'members'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>স্টাফ তালিকা ও দায়িত্ব ({staffList.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('presets')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'presets'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>রোল ডিফল্ট প্রিসেট (Role Presets)</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: STAFF MEMBERS DIRECTORY */}
      {activeSubTab === 'members' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="নাম, ইউজারনেম বা ফোন দিয়ে খুঁজুন..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">সকল পদবী / রোল ({staffList.length})</option>
                <option value="super_admin">সুপার অ্যাডমিন (Super Admin)</option>
                <option value="admin">অ্যাডমিন / ম্যানেজার (Admin)</option>
                <option value="order_manager">অর্ডার ম্যানেজার (Order Manager)</option>
                <option value="kitchen_manager">কিচেন শেফ (Kitchen Chef)</option>
                <option value="delivery_manager">ডেলিভারি সুপারভাইজার (Delivery)</option>
                <option value="accountant">হিসাবরক্ষক (Accountant)</option>
                <option value="delivery_man">ডেলিভারি রাইডার (Rider)</option>
              </select>
            </div>
          </div>

          {/* Staff Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStaff.map((staff) => {
              const meta = ROLE_METADATA[staff.role] || ROLE_METADATA.admin;
              const isSuper = staff.role === 'super_admin' || staff.role === 'admin';
              const permCount = isSuper ? ALL_STAFF_PERMISSIONS.length : staff.permissions.length;

              return (
                <div 
                  key={staff.id} 
                  className={`bg-white rounded-2xl border transition-all p-5 shadow-xs space-y-4 ${
                    staff.is_active ? 'border-slate-200 hover:border-purple-300' : 'border-slate-200 opacity-60 bg-slate-50'
                  }`}
                >
                  {/* Top info */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-xs ${
                        isSuper ? 'bg-gradient-to-tr from-purple-700 to-indigo-600' : 'bg-gradient-to-tr from-slate-700 to-slate-800'
                      }`}>
                        {staff.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-slate-900 text-sm">{staff.name}</h4>
                          {isSuper && <ShieldCheck className="w-4 h-4 text-purple-600 inline" />}
                        </div>
                        <p className="text-xs text-slate-400 font-mono">@{staff.username}</p>
                      </div>
                    </div>

                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggleActive(staff)}
                      disabled={isSuper}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        staff.is_active 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                      title={isSuper ? 'সুপার অ্যাডমিন নিষ্ক্রিয় করা যাবে না' : 'স্টাফ অ্যাকাউন্ট সক্রিয়/নিষ্ক্রিয় করুন'}
                    >
                      {staff.is_active ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয় (Off)'}
                    </button>
                  </div>

                  {/* Role Badge */}
                  <div>
                    <span className={`inline-block px-2.5 py-1 rounded-xl text-xs font-bold border ${meta.badgeColor}`}>
                      {meta.banglaTitle}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">{meta.description}</p>
                  </div>

                  {/* Permissions count & capabilities */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">বরাদ্দকৃত ক্ষমতা:</span>
                      <span className="font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full text-[11px]">
                        {permCount} / {ALL_STAFF_PERMISSIONS.length} পারমিশন
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-purple-600 h-full rounded-full transition-all" 
                        style={{ width: `${Math.round((permCount / ALL_STAFF_PERMISSIONS.length) * 100)}%` }}
                      />
                    </div>

                    {/* Highlighted active modules */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {mockDb.hasPermission(staff.id, 'orders.confirm') && (
                        <span className="text-[10px] font-medium bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded">📦 অর্ডার</span>
                      )}
                      {mockDb.hasPermission(staff.id, 'kitchen.bake') && (
                        <span className="text-[10px] font-medium bg-orange-50 text-orange-800 px-1.5 py-0.5 rounded">🍳 কিচেন</span>
                      )}
                      {mockDb.hasPermission(staff.id, 'delivery.assign') && (
                        <span className="text-[10px] font-medium bg-cyan-50 text-cyan-800 px-1.5 py-0.5 rounded">🚚 ডেলিভারি</span>
                      )}
                      {mockDb.hasPermission(staff.id, 'costing.view') && (
                        <span className="text-[10px] font-medium bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded">💰 কস্টিং ও লাভ</span>
                      )}
                      {mockDb.hasPermission(staff.id, 'settings.manage') && (
                        <span className="text-[10px] font-medium bg-purple-50 text-purple-800 px-1.5 py-0.5 rounded">⚙️ সেটিংস</span>
                      )}
                    </div>
                  </div>

                  {/* Staff Password Indicator & Quick Reset */}
                  <div className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Lock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span>পাসওয়ার্ড:</span>
                      <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 text-purple-900 text-[11px]">
                        {staff.password ? `${staff.password.slice(0, 1)}${'*'.repeat(Math.max(3, staff.password.length - 1))}` : '•••• (min 4 digit)'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setResetPasswordStaff(staff);
                        setResetPasswordValue(staff.password || '1234');
                      }}
                      className="text-[11px] text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer"
                    >
                      পাসওয়ার্ড পরিবর্তন
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setViewingStaffHistory(staff);
                        setStaffHistorySearch('');
                      }}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all border border-slate-200"
                      title="এই স্টাফের সকল কাজের হিস্ট্রি দেখুন"
                    >
                      <History className="w-3.5 h-3.5 text-slate-600" />
                      <span>হিস্ট্রি</span>
                    </button>

                    <button
                      onClick={() => handleOpenPermissionModal(staff)}
                      className="flex-1 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Key className="w-3.5 h-3.5 text-purple-600" />
                      <span>দায়িত্ব ও পারমিশন</span>
                    </button>

                    {!isSuper && (
                      <button
                        onClick={() => handleDeleteStaff(staff)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title="স্টাফ মুছুন"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: ROLE PRESETS */}
      {activeSubTab === 'presets' && (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl flex items-start gap-3">
            <Info className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
            <div className="text-xs text-purple-950 space-y-1">
              <p className="font-bold">রোল প্রিসেট কী?</p>
              <p>
                প্রতিটি রোলের (যেমন অর্ডার ম্যানেজার, কিচেন শেফ, ডেলিভারি ম্যানেজার) জন্য একটি সার্বজনীন ডিফল্ট পারমিশন সেট থাকে।
                এখানে কোনো রোলের ডিফল্ট পারমিশন আপডেট করলে ভবিষ্যতে সেই রোলের যেকোনো নতুন স্টাফ স্বয়ংক্রিয়ভাবে সেই পারমিশন পাবে।
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(ROLE_METADATA) as StaffRole[]).map((role) => {
              const meta = ROLE_METADATA[role];
              const isSuper = role === 'super_admin' || role === 'admin';
              const perms = isSuper ? ALL_STAFF_PERMISSIONS.map(p => p.code) : mockDb.getRolePermissions(role);

              return (
                <div key={role} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${meta.badgeColor}`}>
                          {meta.banglaTitle}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">({meta.title})</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{meta.description}</p>
                    </div>

                    <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
                      {perms.length} পারমিশন
                    </span>
                  </div>

                  {/* Summary of permissions */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1.5">
                    <p className="font-semibold text-slate-800">অনুমোদিত মূল কাজগুলো:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {perms.slice(0, 7).map((p) => {
                        const def = ALL_STAFF_PERMISSIONS.find((item) => item.code === p);
                        return (
                          <span key={p} className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-[11px] text-slate-700">
                            ✓ {def?.label || p}
                          </span>
                        );
                      })}
                      {perms.length > 7 && (
                        <span className="text-[11px] text-purple-700 font-bold self-center">
                          +{perms.length - 7}টি আরও...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => handleOpenRolePresetModal(role)}
                      disabled={isSuper}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                        isSuper 
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{isSuper ? 'সুপার অ্যাডমিন অপরিবর্তনীয়' : 'এই রোলের প্রিসেট এডিট করুন'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL 1: ASSIGN / EDIT PERMISSIONS MODAL */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="perm-modal-title"
            className="bg-white rounded-2xl sm:rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="perm-modal-title" className="text-base font-black">
                    দায়িত্ব ও পারমিশন নির্ধারণ: {editingStaff.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="font-mono">@{editingStaff.username}</span>
                    <span>•</span>
                    <span className="text-purple-300 font-bold">{ROLE_METADATA[editingStaff.role].banglaTitle}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setEditingStaff(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Presets Bar */}
            <div className="bg-slate-50 p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>দ্রুত প্রিসেট প্রয়োগ:</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('order_manager')}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  📦 অর্ডার ম্যানেজার
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('kitchen_manager')}
                  className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  🍳 কিচেন শেফ
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('delivery_manager')}
                  className="px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  🚚 ডেলিভারি
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('accountant')}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  💰 অ্যাকাউন্ট্যান্ট
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPermissions(ALL_STAFF_PERMISSIONS.map(p => p.code))}
                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  ✓ সব সিলেক্ট
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPermissions([])}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  ✕ ক্লিয়ার
                </button>
              </div>
            </div>

            {/* Permissions List By Category */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {(Object.keys(permissionsByCategory) as PermissionCategory[]).map((catKey) => {
                const perms = permissionsByCategory[catKey] || [];
                const CatIcon = getCategoryIcon(catKey);
                const allSelected = perms.every((p) => selectedPermissions.includes(p.code));
                const someSelected = perms.some((p) => selectedPermissions.includes(p.code));

                return (
                  <div key={catKey} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                    {/* Category Header */}
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CatIcon className="w-4 h-4 text-purple-600" />
                        <h4 className="font-bold text-slate-800 text-xs sm:text-sm">
                          {CATEGORY_LABELS[catKey]}
                        </h4>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleCategory(catKey)}
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          allSelected 
                            ? 'bg-purple-100 text-purple-800' 
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {allSelected ? 'সব বন্ধ করুন' : 'এই বিভাগের সব দিন'}
                      </button>
                    </div>

                    {/* Permissions Grid */}
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {perms.map((perm) => {
                        const isChecked = selectedPermissions.includes(perm.code);
                        const isLockedSuperAdmin = (editingStaff.role === 'super_admin' || editingStaff.role === 'admin') && perm.code === 'staff.manage';

                        return (
                          <label
                            key={perm.code}
                            className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                              isChecked 
                                ? 'bg-purple-50/70 border-purple-300 shadow-xs' 
                                : 'bg-white border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isLockedSuperAdmin}
                              onChange={() => handleTogglePermission(perm.code)}
                              className="mt-0.5 w-4 h-4 text-purple-600 rounded-sm border-slate-300 focus:ring-purple-500 cursor-pointer"
                            />
                            <div className="flex-1 space-y-0.5">
                              <div className="flex items-center justify-between gap-1">
                                <span className={`text-xs font-bold ${isChecked ? 'text-purple-950' : 'text-slate-800'}`}>
                                  {perm.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 leading-tight">
                                {perm.description}
                              </p>
                              <span className="inline-block font-mono text-[9px] text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                                {perm.code}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <div className="text-xs">
                <span className="text-slate-500">মোট নির্বাচিত ক্ষমতা: </span>
                <strong className="text-purple-700 font-bold text-sm">
                  {selectedPermissions.length} / {ALL_STAFF_PERMISSIONS.length}
                </strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
                >
                  বাতিল করুন
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-900/30 cursor-pointer transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>পারমিশন সংরক্ষণ করুন</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD NEW STAFF MODAL */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-staff-modal-title"
            className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-purple-400" />
                <h3 id="add-staff-modal-title" className="text-base font-black">
                  নতুন স্টাফ অ্যাকাউন্ট তৈরি করুন
                </h3>
              </div>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">স্টাফের পুরো নাম *</label>
                <input
                  type="text"
                  required
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="যেমন: মোঃ কামরুল ইসলাম"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">ইউজারনেম (লগইন আইডি) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">@</span>
                  <input
                    type="text"
                    required
                    value={newStaffUsername}
                    onChange={(e) => setNewStaffUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="kamrul_dispatch"
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">লগইন পাসওয়ার্ড (নূন্যতম ৪ ডিজিট) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Key className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={newStaffPassword}
                    onChange={(e) => setNewStaffPassword(e.target.value)}
                    placeholder="নূন্যতম ৪ ডিজিট (যেমন: 1234)"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  স্টাফ মেম্বার এই ইউজারনেম ও পাসওয়ার্ড দিয়ে সিস্টেমে লগইন করতে পারবে (কমপক্ষে ৪ সংখ্যা বা ডিজিট)।
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">মোবাইল নম্বর</label>
                  <input
                    type="tel"
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    placeholder="01711-XXXXXX"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">ইমেইল (ঐচ্ছিক)</label>
                  <input
                    type="email"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    placeholder="staff@auroracake.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">পদবী / প্রাথমিক রোল *</label>
                <select
                  value={newStaffRole}
                  onChange={(e) => {
                    const role = e.target.value as StaffRole;
                    setNewStaffRole(role);
                    setNewStaffPermissions(mockDb.getRolePermissions(role));
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="order_manager">অর্ডার ম্যানেজার (Order Manager)</option>
                  <option value="kitchen_manager">কিচেন শেফ (Kitchen Chef)</option>
                  <option value="delivery_manager">ডেলিভারি সুপারভাইজার (Delivery Manager)</option>
                  <option value="accountant">হিসাবরক্ষক (Accountant)</option>
                  <option value="delivery_man">ডেলিভারি রাইডার (Delivery Rider)</option>
                  <option value="admin">স্টোর ম্যানেজার (Admin)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  রোল পরিবর্তন করলে রোলের ডিফল্ট পারমিশন স্বয়ংক্রিয়ভাবে প্রিসেট হবে। অ্যাকাউন্ট তৈরির পর আপনি যেকোনো ক্ষমতা কাস্টমাইজ করতে পারবেন।
                </p>
              </div>

              <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 text-xs text-purple-950 flex items-center justify-between">
                <span>প্রাথমিক পারমিশন বরাদ্দ:</span>
                <strong className="font-bold text-purple-700">
                  {newStaffPermissions.length}টি ক্ষমতা সক্রিয়
                </strong>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-md cursor-pointer"
                >
                  স্টাফ অ্যাকাউন্ট তৈরি করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT ROLE DEFAULT PRESET */}
      {isRolePresetModalOpen && editingRoleTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-preset-title"
            className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div>
                <h3 id="role-preset-title" className="text-base font-black">
                  রোল ডিফল্ট প্রিসেট এডিট: {ROLE_METADATA[editingRoleTarget].banglaTitle}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  ভবিষ্যতে যারা এই রোলে যোগ দেবে তারা স্বয়ংক্রিয়ভাবে এই পারমিশনগুলো পাবে।
                </p>
              </div>
              <button
                onClick={() => setIsRolePresetModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {ALL_STAFF_PERMISSIONS.map((perm) => {
                const isChecked = selectedPermissions.includes(perm.code);
                return (
                  <label
                    key={perm.code}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      isChecked ? 'bg-purple-50/70 border-purple-300' : 'bg-white border-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleTogglePermission(perm.code)}
                      className="mt-0.5 w-4 h-4 text-purple-600 rounded-sm border-slate-300 focus:ring-purple-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{perm.label}</span>
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {perm.categoryLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{perm.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-600">
                নির্বাচিত: <strong>{selectedPermissions.length}</strong> পারমিশন
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsRolePresetModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={handleSaveRolePreset}
                  className="px-5 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md"
                >
                  প্রিসেট সংরক্ষণ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: RESET STAFF PASSWORD */}
      {resetPasswordStaff && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 id="reset-password-title" className="text-base font-black flex items-center gap-2">
                  <Key className="w-5 h-5" /> স্টাফ পাসওয়ার্ড পরিবর্তন
                </h3>
                <p className="text-xs text-purple-100 mt-0.5">
                  {resetPasswordStaff.name} (@{resetPasswordStaff.username})
                </p>
              </div>
              <button
                onClick={() => setResetPasswordStaff(null)}
                className="p-1.5 text-purple-200 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  নতুন পাসওয়ার্ড (নূন্যতম ৪ ডিজিট) *
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  placeholder="নূন্যতম ৪ ডিজিট লিখুন (যেমন: 1234)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <p className="text-[11px] text-slate-500">
                  স্টাফ সহজে মনে রাখার জন্য যেকোনো ৪ ডিজিট বা তার বেশি অক্ষরের পাসওয়ার্ড নির্ধারণ করতে পারেন।
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordStaff(null)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  পাসওয়ার্ড সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: STAFF ACTIVITY HISTORY MODAL */}
      {viewingStaffHistory && (() => {
        const staffMeta = ROLE_METADATA[viewingStaffHistory.role] || ROLE_METADATA.admin;
        const allLogs = mockDb.getStaffAuditLogs();
        const staffLogs = allLogs.filter(log => {
          const match = 
            log.actor_name.toLowerCase().includes(viewingStaffHistory.name.toLowerCase()) ||
            log.actor_name.toLowerCase().includes(viewingStaffHistory.username.toLowerCase()) ||
            (log.staff_role && log.staff_role === viewingStaffHistory.role);
          if (!match) return false;

          if (staffHistorySearch.trim()) {
            const q = staffHistorySearch.trim().toLowerCase();
            return (
              log.action.toLowerCase().includes(q) ||
              log.details.toLowerCase().includes(q) ||
              log.entity_type.toLowerCase().includes(q)
            );
          }
          return true;
        });

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-6 max-h-[94vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-purple-800 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center text-lg font-black border border-white/20">
                    {viewingStaffHistory.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-black flex items-center gap-2">
                      <span>{viewingStaffHistory.name}</span>
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                        @{viewingStaffHistory.username}
                      </span>
                    </h3>
                    <p className="text-xs text-purple-200 mt-0.5">
                      {staffMeta.banglaTitle} • {viewingStaffHistory.phone || 'মোবাইল উল্লেখ নেই'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingStaffHistory(null)}
                  className="p-1.5 text-purple-200 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sub-bar with search & stats */}
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700">
                    মোট রেকর্ডকৃত কাজ: <strong className="text-purple-700 font-mono text-sm">{staffLogs.length}</strong> টি
                  </div>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="কাজের বিবরণ বা অর্ডার নং..."
                    value={staffHistorySearch}
                    onChange={(e) => setStaffHistorySearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-purple-500"
                  />
                </div>
              </div>

              {/* Activities List */}
              <div className="p-5 overflow-y-auto space-y-3 flex-1">
                {staffLogs.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 space-y-2">
                    <History className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold text-slate-600">এই কর্মীর কোনো কাজের রেকর্ড পাওয়া যায়নি</p>
                    <p className="text-[11px] text-slate-400">নতুন কোনো অর্ডার পরিবর্তন, কিচেন কাজ বা ডেলিভারি করলে এখানে স্বয়ংক্রিয়ভাবে জমা হবে।</p>
                  </div>
                ) : (
                  staffLogs.map((log) => {
                    const logDate = new Date(log.created_at);
                    const formattedTime = logDate.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
                    const formattedDate = logDate.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });

                    return (
                      <div
                        key={log.id}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-purple-200 hover:shadow-xs transition-all flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <strong className="text-slate-900 font-bold">{log.action}</strong>
                            <span className="text-[10px] bg-purple-50 text-purple-800 px-2 py-0.5 rounded-md font-mono border border-purple-100">
                              {log.entity_type}
                            </span>
                          </div>
                          <p className="text-slate-600 text-xs leading-relaxed">{log.details}</p>
                        </div>
                        <div className="text-right shrink-0 text-[11px] text-slate-400">
                          <span className="font-bold text-slate-700 block">{formattedTime}</span>
                          <span>{formattedDate}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setViewingStaffHistory(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  বন্ধ করুন (Close)
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
