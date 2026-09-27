import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Check, CheckCircle2, ChevronRight,
  Copy, Crown, Database, DollarSign, Download, Eye, FileText, Globe, Heart, Layers,
  Lock, LogOut, Menu, RefreshCw, Search, Settings, Shield, Sparkles, TrendingUp, Users, Wallet,
  X, XCircle
} from 'lucide-react';
import { authEmailForUsername, isSupabaseConfigured, supabase } from './supabase';

const FALLBACK_PACKAGES = [
  { id: 'basic', name: 'BASIC', deposit: 10, daily_accrual: 2, duration_days: 45, status: 'ACTIVE', display_order: 1, description: 'Entry tier starter package with a 45-day cycle.' },
  { id: 'rare', name: 'RARE', deposit: 25, daily_accrual: 6, duration_days: 45, status: 'ACTIVE', display_order: 2, description: 'Mid-level package configuration with a 45-day cycle.' },
  { id: 'epic', name: 'EPIC', deposit: 35, daily_accrual: 10, duration_days: 45, status: 'ACTIVE', display_order: 3, description: 'Higher-tier package configuration with a 45-day cycle.' },
  { id: 'legendary', name: 'LEGENDARY', deposit: 50, daily_accrual: 14, duration_days: 45, status: 'ACTIVE', display_order: 4, description: 'Advanced package configuration with a 45-day cycle.' },
  { id: 'mythic', name: 'MYTHIC', deposit: 100, daily_accrual: 20, duration_days: 45, status: 'ACTIVE', display_order: 5, description: 'Top-tier package configuration with a 45-day cycle.' },
];

const EMPTY_SETTINGS = {
  id: 'default',
  binance_pay_id: '', trc20_address: '', bep20_address: '',
  binance_qr_url: '', trc20_qr_url: '', bep20_qr_url: '',
  instructions: 'Please send the exact amount to the address shown and paste the transaction hash/TxID. Upload a payment screenshot when available.',
  min_deposit: 10, min_donation: 1, min_withdrawal: 5,
  binance_enabled: true, trc20_enabled: true, bep20_enabled: true,
};

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const dateTime = (s) => s ? new Date(s).toLocaleString() : '—';
const shortId = (s) => s ? `${s.slice(0, 10)}…${s.slice(-6)}` : '—';
const errorMessage = (e) => e?.message || e?.error_description || 'Something went wrong';

function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function StatCard({ label, value, icon: Icon, sub }) {
  return <Card className="stat-card"><div className="stat-icon"><Icon size={20}/></div><div><div className="muted tiny">{label}</div><div className="stat-value">{value}</div>{sub && <div className="muted tiny">{sub}</div>}</div></Card>;
}

function App() {
  const [page, setPage] = useState('home');
  const [adminTab, setAdminTab] = useState('overview');
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [packages, setPackages] = useState([]);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [stats, setStats] = useState({ registered_users: 0, active_packages: 0, verified_deposits: 0, verified_withdrawals: 0, verified_donations: 0, verified_donors: 0 });
  const [announcements, setAnnouncements] = useState([]);
  const [activePackage, setActivePackage] = useState(null);
  const [myDeposits, setMyDeposits] = useState([]);
  const [myWithdrawals, setMyWithdrawals] = useState([]);
  const [myDonations, setMyDonations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [adminData, setAdminData] = useState({ users: [], deposits: [], withdrawals: [], donations: [], audit: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const notify = (message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  };

  const refreshPublic = async () => {
    if (!supabase) return;
    const [p, s, st, a] = await Promise.all([
      supabase.from('packages').select('*').eq('status', 'ACTIVE').order('display_order'),
      supabase.from('payment_settings').select('*').eq('id', 'default').single(),
      supabase.from('public_platform_stats').select('*').single(),
      supabase.from('announcements').select('*').eq('active', true).order('created_at', { ascending: false }),
    ]);
    if (p.error) throw p.error; if (s.error && s.error.code !== 'PGRST116') throw s.error; if (st.error) throw st.error; if (a.error) throw a.error;
    setPackages(p.data || []);
    setSettings(s.data || EMPTY_SETTINGS);
    setStats(st.data || stats);
    setAnnouncements(a.data || []);
  };

  const refreshUser = async (s = session) => {
    if (!supabase || !s?.user) return;
    await supabase.rpc('process_my_rewards');
    const { data: p, error: pe } = await supabase.from('profiles').select('*').eq('id', s.user.id).single();
    if (pe) throw pe;
    const [up, d, w, dn, tx] = await Promise.all([
      supabase.from('user_packages').select('*').eq('user_id', s.user.id).order('created_at', { ascending: false }),
      supabase.from('deposits').select('*').eq('user_id', s.user.id).order('submitted_at', { ascending: false }),
      supabase.from('withdrawals').select('*').eq('user_id', s.user.id).order('requested_at', { ascending: false }),
      supabase.from('donations').select('*').eq('user_id', s.user.id).order('submitted_at', { ascending: false }),
      supabase.from('transactions').select('*').eq('user_id', s.user.id).order('created_at', { ascending: false }).limit(100),
    ]);
    for (const q of [up, d, w, dn, tx]) if (q.error) throw q.error;
    setProfile(p); setActivePackage((up.data || []).find(x => x.status === 'ACTIVE') || null);
    setMyDeposits(d.data || []); setMyWithdrawals(w.data || []); setMyDonations(dn.data || []); setTransactions(tx.data || []);
  };

  const refreshAdmin = async () => {
    if (!supabase) return;
    const [u, d, w, dn, a] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('deposits').select('*').order('submitted_at', { ascending: false }),
      supabase.from('withdrawals').select('*').order('requested_at', { ascending: false }),
      supabase.from('donations').select('*').order('submitted_at', { ascending: false }),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    for (const q of [u, d, w, dn, a]) if (q.error) throw q.error;
    setAdminData({ users: u.data || [], deposits: d.data || [], withdrawals: w.data || [], donations: dn.data || [], audit: a.data || [] });
  };

  const refresh = async () => {
    if (!supabase) return;
    try {
      setLoading(true);
      await refreshPublic();
      if (session) {
        await refreshUser(session);
        if (profile?.role === 'admin') await refreshAdmin();
      }
    } catch (e) {
      console.error(e);
      notify(errorMessage(e), 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { refreshPublic().catch(() => {}); }, []);

  useEffect(() => {
    if (!supabase || !session) {
      if (!session) { setProfile(null); setActivePackage(null); setMyDeposits([]); setMyWithdrawals([]); setMyDonations([]); setTransactions([]); }
      return;
    }
    refreshUser(session).then(async () => {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(p || null);
      if (p?.role === 'admin') refreshAdmin().catch(() => {});
    }).catch(e => notify(errorMessage(e), 'error'));
  }, [session]);

  useEffect(() => {
    const h = () => refreshPublic().catch(() => {});
    window.addEventListener('focus', h);
    return () => window.removeEventListener('focus', h);
  }, []);

  const logout = async () => {
    await supabase?.auth.signOut();
    setPage('home'); setAdminTab('overview'); setMobileOpen(false); notify('Signed out');
  };

  const go = (p) => { setPage(p); setMobileOpen(false); };

  if (!isSupabaseConfigured) return <SetupScreen />;

  return <div className="app-shell">
    <Navbar profile={profile} page={page} go={go} logout={logout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
    <main className="main">
      {page === 'home' && <Home stats={stats} packages={packages} announcements={announcements} go={go} />}
      {page === 'login' && <Login go={go} notify={notify} />}
      {page === 'register' && <Register go={go} notify={notify} />}
      {page === 'dashboard' && profile && <Dashboard profile={profile} activePackage={activePackage} deposits={myDeposits} withdrawals={myWithdrawals} donations={myDonations} transactions={transactions} go={go} refresh={refresh} notify={notify} />}
      {page === 'deposit' && profile && <Deposit profile={profile} packages={packages} settings={settings} activePackage={activePackage} refresh={refresh} notify={notify} />}
      {page === 'withdraw' && profile && <Withdraw profile={profile} settings={settings} refresh={refresh} notify={notify} />}
      {page === 'donate' && profile && <Donate profile={profile} settings={settings} refresh={refresh} notify={notify} />}
      {page === 'donations' && <PublicDonations />}
      {page === 'admin' && profile?.role === 'admin' && <AdminPanel profile={profile} packages={packages} settings={settings} data={adminData} tab={adminTab} setTab={setAdminTab} refresh={refresh} notify={notify} />}
      {['risk','terms','privacy'].includes(page) && <LegalPage kind={page} />}
      {!loading && page !== 'home' && !profile && ['dashboard','deposit','withdraw','donate','admin'].includes(page) && <div className="container"><Card><h2>Login required</h2><p className="muted">Please sign in to access this section.</p><button className="btn primary" onClick={() => go('login')}>Sign in</button></Card></div>}
    </main>
    <Footer go={go} />
    {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}<span>{toast.message}</span></div>}
  </div>;
}

function SetupScreen() {
  return <div className="setup-page"><div className="setup-box"><Crown size={48} className="gold"/><h1>International LionProfit</h1><p className="muted">Supabase is not configured yet.</p><p>Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase project URL and publishable key, then run <code>npm install</code> and <code>npm run dev</code>.</p><div className="notice"><Shield size={17}/> Never place a Supabase service-role key in the frontend.</div></div></div>;
}

function Navbar({ profile, page, go, logout, mobileOpen, setMobileOpen }) {
  return <nav className="nav"><div className="nav-inner"><button className="brand" onClick={() => go('home')}><span className="logo"><Crown size={23}/></span><span>INTERNATIONAL <b>LIONPROFIT</b></span></button><button className="mobile-menu" onClick={() => setMobileOpen(v => !v)}>{mobileOpen ? <X/> : <Menu/>}</button><div className={`nav-links ${mobileOpen ? 'open' : ''}`}>
    <button onClick={() => go('home')} className={page==='home'?'active':''}>Home</button>
    <button onClick={() => go('donations')} className={page==='donations'?'active':''}>Donations</button>
    {profile ? <><button onClick={() => go('dashboard')} className={page==='dashboard'?'active':''}>Dashboard</button><button onClick={() => go('deposit')} className={page==='deposit'?'active':''}>Deposit</button><button onClick={() => go('withdraw')} className={page==='withdraw'?'active':''}>Withdraw</button><button onClick={() => go('donate')} className={page==='donate'?'active':''}>Donate</button>{profile.role==='admin' && <button onClick={() => go('admin')} className={page==='admin'?'active admin':''}>Admin</button>}<button onClick={logout} className="nav-danger"><LogOut size={15}/> Logout</button></> : <><button onClick={() => go('login')}>Login</button><button className="nav-cta" onClick={() => go('register')}>Create Account</button></>}
  </div></div></nav>;
}

function Home({ stats, packages, announcements, go }) {
  return <div>
    <section className="hero"><div className="container hero-grid"><div><div className="eyebrow"><Sparkles size={15}/> LIVE PLATFORM</div><h1>Build your <span>reward ledger</span> with clear records.</h1><p className="hero-copy">International LionProfit uses manual payment verification, database-backed balances and administrator-controlled payment settings. Package numbers are configurable and not guaranteed returns.</p><div className="hero-actions"><button className="btn primary" onClick={() => go('register')}>Create Account <ChevronRight size={17}/></button><button className="btn ghost" onClick={() => go('donations')}>View Donations</button></div></div><Card className="hero-panel"><div className="panel-title"><Activity size={17}/> Platform stats</div><div className="stats-grid"><StatMini label="Registered users" value={stats.registered_users}/><StatMini label="Active packages" value={stats.active_packages}/><StatMini label="Verified donations" value={money(stats.verified_donations)}/><StatMini label="Verified payouts" value={money(stats.verified_withdrawals)}/></div><div className="tiny muted">Stats are database-derived; no demo values are added.</div></Card></div></section>
    <section className="section"><div className="container"><div className="section-head"><div><div className="eyebrow">PACKAGE PLANS</div><h2>Available configurations</h2></div><span className="muted tiny">Reward figures are configurable, not a promise of profit.</span></div><div className="package-grid">{(packages.length ? packages : FALLBACK_PACKAGES).map((p, i) => <PackageCard key={p.id} p={p} featured={i===2} go={go}/>)}</div></div></section>
    <section className="section alt"><div className="container"><div className="section-head"><div><div className="eyebrow">ANNOUNCEMENTS</div><h2>Latest notices</h2></div></div><div className="announcement-grid">{announcements.length ? announcements.map(a => <Card key={a.id}><div className="row-between"><b>{a.title}</b><span className="tiny muted">{dateTime(a.created_at)}</span></div><p className="muted">{a.content}</p></Card>) : <Card><p className="muted">No announcements yet.</p></Card>}</div></div></section>
  </div>;
}

function StatMini({ label, value }) { return <div className="stat-mini"><div className="muted tiny">{label}</div><b>{value}</b></div>; }
function PackageCard({ p, featured, go }) { return <Card className={featured ? 'package featured' : 'package'}><div className="package-badge">{featured ? 'POPULAR' : p.name}</div><h3>{p.name}</h3><div className="package-price">{money(p.deposit)}</div><div className="package-row"><span>Daily accrual</span><b>{money(p.daily_accrual)}</b></div><div className="package-row"><span>Cycle</span><b>{p.duration_days} days</b></div><p className="muted tiny">{p.description}</p><button className="btn full" onClick={() => go('register')}>Get started</button></Card>; }

function Login({ go, notify }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy,setBusy]=useState(false);
  const submit = async e => { e.preventDefault(); if (!supabase) return; setBusy(true); try { const { error } = await supabase.auth.signInWithPassword({ email: authEmailForUsername(username), password }); if (error) throw error; notify('Welcome back'); go('dashboard'); } catch(e) { notify(errorMessage(e), 'error'); } finally { setBusy(false); } };
  return <div className="auth-wrap"><Card className="auth-card"><div className="auth-icon"><Lock/></div><h2>Sign in</h2><p className="muted tiny">Use the username and password you created.</p><form onSubmit={submit}><label>Username<input value={username} onChange={e=>setUsername(e.target.value.trim().toLowerCase())} required minLength={3}/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6}/></label><button className="btn primary full" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form><p className="center muted tiny">No account? <button className="link" onClick={()=>go('register')}>Create one</button></p></Card></div>;
}

function Register({ go, notify }) {
  const [username,setUsername]=useState(''); const [phone,setPhone]=useState(''); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState(''); const [busy,setBusy]=useState(false);
  const submit = async e => { e.preventDefault(); if (password !== confirm) return notify('Passwords do not match','error'); if (!/^[a-z0-9_]{3,24}$/.test(username)) return notify('Username must be 3–24 lowercase letters, numbers or underscore','error'); setBusy(true); try { const { data, error } = await supabase.auth.signUp({ email: authEmailForUsername(username), password, options: { data: { username: username.toLowerCase(), phone, contact_email: email || '' } } }); if (error) throw error; if (!data.session) notify('Account created. Complete Supabase email confirmation if it is enabled.'); else notify('Account created'); go(data.session ? 'dashboard' : 'login'); } catch(e) { notify(errorMessage(e),'error'); } finally { setBusy(false); } };
  return <div className="auth-wrap"><Card className="auth-card"><div className="auth-icon"><Crown/></div><h2>Create Lion Account</h2><p className="muted tiny">Phone is stored in your profile; email is optional for contact.</p><form onSubmit={submit}><label>Username<input value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} placeholder="lion_trader" required/></label><label>Phone<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+92…" required/></label><label>Contact email <span className="muted">(optional)</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required/></label><label>Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={6} required/></label><button className="btn primary full" disabled={busy}>{busy?'Creating…':'Create account'}</button></form><p className="center muted tiny">Already registered? <button className="link" onClick={()=>go('login')}>Sign in</button></p></Card></div>;
}

function Dashboard({ profile, activePackage, deposits, withdrawals, donations, transactions, go, refresh, notify }) {
  const daysLeft = activePackage ? Math.max(0, Math.ceil((new Date(activePackage.end_at)-Date.now())/86400000)) : 0;
  const completed = activePackage?.days_completed || 0;
  return <div className="container section"><div className="section-head"><div><div className="eyebrow">ACCOUNT DASHBOARD</div><h2>Welcome, {profile.username}</h2></div><button className="btn ghost" onClick={refresh}><RefreshCw size={15}/> Refresh</button></div><div className="stats-grid four"><StatCard label="Available balance" value={money(profile.available_balance)} icon={Wallet}/><StatCard label="Pending withdrawal" value={money(profile.pending_withdrawal)} icon={ArrowUpRight}/><StatCard label="Active package" value={activePackage?.package_name || 'None'} icon={Layers}/><StatCard label="Days remaining" value={daysLeft} icon={Activity}/></div><div className="two-col"><Card><div className="panel-title"><Layers size={17}/> Current package</div>{activePackage ? <><div className="big-line"><b>{activePackage.package_name}</b><span className="pill success">{activePackage.status}</span></div><div className="package-row"><span>Deposit</span><b>{money(activePackage.deposit_amount)}</b></div><div className="package-row"><span>Daily accrual</span><b>{money(activePackage.daily_accrual)}</b></div><div className="package-row"><span>Progress</span><b>{completed}/{activePackage.days_total} days</b></div><div className="progress"><span style={{width:`${Math.min(100,(completed/activePackage.days_total)*100)}%`}}/></div><div className="package-row"><span>Start</span><b>{dateTime(activePackage.start_at)}</b></div><div className="package-row"><span>End</span><b>{dateTime(activePackage.end_at)}</b></div></> : <div className="empty"><p>No active package.</p><button className="btn primary" onClick={()=>go('deposit')}>Submit deposit</button></div>}</Card><Card><div className="panel-title"><TrendingUp size={17}/> Quick actions</div><div className="action-grid"><button onClick={()=>go('deposit')}><ArrowDownRight/> Deposit</button><button onClick={()=>go('withdraw')}><ArrowUpRight/> Withdraw</button><button onClick={()=>go('donate')}><Heart/> Donate</button><button onClick={()=>go('donations')}><Users/> Public stats</button></div></Card></div><Card><div className="panel-title"><FileText size={17}/> Recent ledger</div><Table headers={['Type','Amount','Balance after','Date']} rows={transactions.slice(0,10).map(t => [t.type, money(t.amount), money(t.balance_after), dateTime(t.created_at)])}/></Card><div className="two-col"><UserHistory title="Deposits" items={deposits.map(d=>({left:`${d.package_name} · ${d.method}`, right:d.status, meta:`${money(d.amount)} · ${dateTime(d.submitted_at)}`}))}/><UserHistory title="Withdrawals" items={withdrawals.map(w=>({left:w.method, right:w.status, meta:`${money(w.amount)} · ${dateTime(w.requested_at)}`}))}/></div><div className="two-col"><UserHistory title="Donations" items={donations.map(d=>({left:d.method, right:d.status, meta:`${money(d.amount)} · ${dateTime(d.submitted_at)}`}))}/><Card><div className="panel-title"><Shield size={17}/> Account status</div><div className="row-between"><span>Status</span><b className="pill success">{profile.account_status}</b></div><p className="muted tiny">Balances are stored in Supabase and changed through server-side database functions.</p></Card></div></div>;
}

function UserHistory({title,items}) { return <Card><div className="panel-title"><FileText size={17}/> {title}</div>{items.length ? <div className="history">{items.slice(0,8).map((x,i)=><div className="history-row" key={i}><div><b>{x.left}</b><div className="muted tiny">{x.meta}</div></div><span className="pill">{x.right}</span></div>)}</div> : <p className="muted tiny">No records.</p>}</Card>; }
function Table({ headers, rows }) { return rows.length ? <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div> : <p className="muted tiny">No records found.</p>; }

async function uploadProof(file, userId) {
  if (!file) return null;
  if (file.size > 5*1024*1024) throw new Error('File must be 5MB or smaller');
  if (!file.type.startsWith('image/')) throw new Error('Only image proof files are allowed');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('payment-proofs').upload(path, file, { upsert:false, contentType:file.type });
  if (error) throw error;
  return path;
}

function Deposit({ profile, packages, settings, activePackage, refresh, notify }) {
  const [pkg,setPkg]=useState(packages[0]?.id||''); const [method,setMethod]=useState('USDT TRC20'); const [txid,setTxid]=useState(''); const [wallet,setWallet]=useState(''); const [file,setFile]=useState(null); const [busy,setBusy]=useState(false);
  const selected = packages.find(p=>p.id===pkg) || packages[0];
  const address = method==='Binance Pay'?settings.binance_pay_id:method==='USDT TRC20'?settings.trc20_address:settings.bep20_address;
  const qr = method==='Binance Pay'?settings.binance_qr_url:method==='USDT TRC20'?settings.trc20_qr_url:settings.bep20_qr_url;
  const enabled = method==='Binance Pay'?settings.binance_enabled:method==='USDT TRC20'?settings.trc20_enabled:settings.bep20_enabled;
  const submit = async e=>{e.preventDefault(); if(activePackage) return notify('You already have an active package','error'); if(!selected) return notify('No active package is available','error'); if(!enabled || !address) return notify('Selected payment method is not configured by admin','error'); setBusy(true); let proof=null; try { proof=await uploadProof(file,profile.id); const {data,error}=await supabase.rpc('submit_deposit',{p_package_id:selected.id,p_method:method,p_txid:txid,p_sender_wallet:wallet,p_proof_path:null}); if(error) throw error; if(proof && data) { const a=await supabase.rpc('attach_deposit_proof',{p_deposit_id:data,p_proof_path:proof}); if(a.error) throw a.error; } notify('Deposit submitted for manual verification'); setTxid(''); setWallet(''); setFile(null); await refresh(); } catch(e){notify(errorMessage(e),'error');} finally{setBusy(false);} };
  return <div className="container section"><div className="section-head"><div><div className="eyebrow">MANUAL DEPOSIT</div><h2>Submit package payment</h2></div></div><Card>{activePackage && <div className="notice warning"><AlertTriangle size={17}/> You already have an active package. A second package cannot be activated until the current cycle is completed.</div>}<form onSubmit={submit} className="form-grid"><div className="span-2"><label>Package<select value={pkg} onChange={e=>setPkg(e.target.value)} disabled={!!activePackage}>{packages.map(p=><option key={p.id} value={p.id}>{p.name} — {money(p.deposit)} — +{money(p.daily_accrual)}/day</option>)}</select></label></div><div className="span-2"><label>Payment method<div className="method-grid">{['USDT TRC20','USDT BEP20','Binance Pay'].map(m=><button key={m} type="button" className={`method ${method===m?'selected':''}`} onClick={()=>setMethod(m)}>{m}</button>)}</div></label></div><div className="span-2 payment-box"><div className="row-between"><b>Official destination</b><span className={`pill ${address&&enabled?'success':'danger'}`}>{address&&enabled?'READY':'NOT CONFIGURED'}</span></div>{address&&enabled?<><div className="copy-row"><code>{address}</code><CopyButton value={address} notify={notify}/></div>{qr&&<img src={qr} alt="Payment QR" className="qr"/>}<p className="muted tiny">{settings.instructions}</p></>:<p className="muted tiny">This method has not been configured by the administrator yet.</p>}</div><label>Transaction TxID / Hash<input value={txid} onChange={e=>setTxid(e.target.value)} required minLength={6}/></label><label>Sender wallet <span className="muted">(optional)</span><input value={wallet} onChange={e=>setWallet(e.target.value)}/></label><label>Payment screenshot <span className="muted">(optional, max 5MB)</span><input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><div className="span-2"><button className="btn primary" disabled={busy||!selected||!!activePackage}>{busy?'Submitting…':'Submit deposit request'}</button></div></form></Card></div>;
}

function Withdraw({ profile, settings, refresh, notify }) {
  const [amount,setAmount]=useState(''); const [method,setMethod]=useState('USDT TRC20'); const [destination,setDestination]=useState(''); const [busy,setBusy]=useState(false);
  const submit=async e=>{e.preventDefault(); setBusy(true); try { const {error}=await supabase.rpc('request_withdrawal',{p_amount:Number(amount),p_method:method,p_destination:destination}); if(error) throw error; notify('Withdrawal request submitted'); setAmount(''); setDestination(''); await refresh(); } catch(e){notify(errorMessage(e),'error');} finally{setBusy(false);} };
  return <div className="container section"><div className="section-head"><div><div className="eyebrow">WITHDRAWAL</div><h2>Request payout</h2></div><div className="balance-chip"><Wallet size={16}/> {money(profile.available_balance)} available</div></div><Card><form onSubmit={submit} className="form-grid"><label>Amount (minimum {money(settings.min_withdrawal)})<input type="number" step="0.00000001" min={settings.min_withdrawal} max={profile.available_balance} value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label>Method<select value={method} onChange={e=>setMethod(e.target.value)}><option>USDT TRC20</option><option>USDT BEP20</option><option>Binance Pay</option></select></label><label className="span-2">Destination / wallet / Pay ID<input value={destination} onChange={e=>setDestination(e.target.value)} required minLength={6}/></label><div className="span-2 notice">Withdrawals reserve the balance immediately. An admin manually sends the payout and records the payout TxID. Rejected requests release the reserved balance.</div><div className="span-2"><button className="btn primary" disabled={busy||Number(amount)<=0}>{busy?'Submitting…':'Submit withdrawal'}</button></div></form></Card></div>;
}

function Donate({ profile, settings, refresh, notify }) {
  const [kind,setKind]=useState('balance'); const [amount,setAmount]=useState(''); const [method,setMethod]=useState('USDT TRC20'); const [txid,setTxid]=useState(''); const [name,setName]=useState(profile.username); const [anonymous,setAnonymous]=useState(false); const [message,setMessage]=useState(''); const [file,setFile]=useState(null); const [busy,setBusy]=useState(false);
  const submit=async e=>{e.preventDefault(); setBusy(true); let proof=null; try { if(kind==='balance'){const {error}=await supabase.rpc('create_balance_donation',{p_amount:Number(amount),p_donor_name:name,p_is_anonymous:anonymous,p_message:message}); if(error) throw error;} else {proof=await uploadProof(file,profile.id); const {data,error}=await supabase.rpc('submit_external_donation',{p_amount:Number(amount),p_method:method,p_txid:txid,p_donor_name:name,p_is_anonymous:anonymous,p_message:message,p_proof_path:null}); if(error) throw error; if(proof&&data){const a=await supabase.rpc('attach_donation_proof',{p_donation_id:data,p_proof_path:proof}); if(a.error) throw a.error;} } notify(kind==='balance'?'Donation verified and added to public stats':'Donation submitted for admin verification'); setAmount(''); setTxid(''); setMessage(''); await refresh(); } catch(e){notify(errorMessage(e),'error');} finally{setBusy(false);} };
  return <div className="container section"><div className="section-head"><div><div className="eyebrow">HELP POOR FAMILIES</div><h2>Make a donation</h2></div></div><Card><div className="method-grid two"><button className={`method ${kind==='balance'?'selected':''}`} onClick={()=>setKind('balance')} type="button"><Wallet/> Reward balance</button><button className={`method ${kind==='external'?'selected':''}`} onClick={()=>setKind('external')} type="button"><Globe/> External crypto</button></div><form onSubmit={submit} className="form-grid"><label>Amount (minimum {money(settings.min_donation)})<input type="number" min={settings.min_donation} step="0.00000001" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>{kind==='external'?<label>Method<select value={method} onChange={e=>setMethod(e.target.value)}><option>USDT TRC20</option><option>USDT BEP20</option><option>Binance Pay</option></select></label>:<div/>}{kind==='external'&&<label>Transaction TxID / Hash<input value={txid} onChange={e=>setTxid(e.target.value)} minLength={6} required/></label>}<label>Donor name<input value={name} onChange={e=>setName(e.target.value)}/></label><label className="check"><input type="checkbox" checked={anonymous} onChange={e=>setAnonymous(e.target.checked)}/> Show anonymously</label><label className="span-2">Message <textarea value={message} onChange={e=>setMessage(e.target.value)} rows="3"/></label>{kind==='external'&&<label>Proof screenshot <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>}<div className="span-2"><button className="btn primary" disabled={busy}>{busy?'Submitting…':'Submit donation'}</button></div></form></Card></div>;
}

function PublicDonations() {
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{supabase?.from('donations').select('donor_name,is_anonymous,amount,method,message,verified_at').eq('status','VERIFIED').order('verified_at',{ascending:false}).limit(100).then(({data})=>{setRows(data||[]);setLoading(false);});},[]);
  return <div className="container section"><div className="section-head"><div><div className="eyebrow">VERIFIED PUBLIC DONATIONS</div><h2>Community giving</h2></div></div><Card>{loading?<p className="muted">Loading…</p>:rows.length?<div className="history">{rows.map((d,i)=><div className="history-row" key={i}><div><b>{d.is_anonymous?'Anonymous donor':(d.donor_name||'Community donor')}</b><div className="muted tiny">{d.method} · {dateTime(d.verified_at)}{d.message?` · ${d.message}`:''}</div></div><b className="green">{money(d.amount)}</b></div>)}</div>:<div className="empty"><p>No verified donations yet.</p></div>}</Card></div>;
}

function AdminPanel({ profile, packages, settings, data, tab, setTab, refresh, notify }) {
  const [localSettings,setLocalSettings]=useState(settings); const [busy,setBusy]=useState(false);
  useEffect(()=>setLocalSettings(settings),[settings]);
  const saveSettings=async e=>{e.preventDefault(); setBusy(true); try{const {error}=await supabase.rpc('update_payment_settings',{p_settings:{...localSettings}}); if(error) throw error; notify('Payment settings saved'); await refresh();}catch(e){notify(errorMessage(e),'error');}finally{setBusy(false);}};
  const approveDeposit=async id=>{try{const {error}=await supabase.rpc('approve_deposit',{p_deposit_id:id});if(error)throw error;notify('Deposit approved and package activated');await refresh();}catch(e){notify(errorMessage(e),'error');}};
  const rejectDeposit=async id=>{try{const {error}=await supabase.rpc('reject_deposit',{p_deposit_id:id,p_note:'Rejected by administrator'});if(error)throw error;notify('Deposit rejected');await refresh();}catch(e){notify(errorMessage(e),'error');}};
  const sendWithdrawal=async id=>{const tx=window.prompt('Enter the payout TxID after sending the payout:');if(!tx)return;try{const {error}=await supabase.rpc('mark_withdrawal_sent',{p_withdrawal_id:id,p_payout_txid:tx,p_note:'Payout sent manually'});if(error)throw error;notify('Withdrawal marked as sent');await refresh();}catch(e){notify(errorMessage(e),'error');}};
  const rejectWithdrawal=async id=>{const note=window.prompt('Optional rejection note:')||'Withdrawal rejected';try{const {error}=await supabase.rpc('reject_withdrawal',{p_withdrawal_id:id,p_note:note});if(error)throw error;notify('Withdrawal rejected and balance released');await refresh();}catch(e){notify(errorMessage(e),'error');}};
  const verifyDonation=async id=>{try{const {error}=await supabase.rpc('verify_donation',{p_donation_id:id,p_note:'Verified by administrator'});if(error)throw error;notify('Donation verified');await refresh();}catch(e){notify(errorMessage(e),'error');}};
  const rejectDonation=async id=>{try{const {error}=await supabase.rpc('reject_donation',{p_donation_id:id,p_note:'Rejected by administrator'});if(error)throw error;notify('Donation rejected');await refresh();}catch(e){notify(errorMessage(e),'error');}};
  const setStatus=async (id,status)=>{try{const {error}=await supabase.rpc('admin_set_user_status',{p_user_id:id,p_status:status});if(error)throw error;notify('User status updated');await refresh();}catch(e){notify(errorMessage(e),'error');}};
  return <div className="container section"><div className="section-head"><div><div className="eyebrow">ADMINISTRATOR</div><h2>Control panel</h2><div className="tiny muted">Signed in as {profile.username}</div></div><button className="btn ghost" onClick={refresh}><RefreshCw size={15}/> Refresh</button></div><div className="admin-tabs">{[['overview','Overview'],['users','Users'],['deposits','Deposits'],['withdrawals','Withdrawals'],['donations','Donations'],['payment','Payment settings'],['packages','Packages'],['audit','Audit logs']].map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
    {tab==='overview'&&<div className="stats-grid four"><StatCard label="Users" value={data.users.length} icon={Users}/><StatCard label="Pending deposits" value={data.deposits.filter(x=>x.status==='PENDING').length} icon={ArrowDownRight}/><StatCard label="Pending withdrawals" value={data.withdrawals.filter(x=>x.status==='PENDING').length} icon={ArrowUpRight}/><StatCard label="Audit rows" value={data.audit.length} icon={Database}/></div>}
    {tab==='users'&&<Card><Table headers={['Username','Phone','Role','Status','Balance','Joined','Action']} rows={data.users.map(u=>[u.username,u.phone,u.role,<span className={`pill ${u.account_status==='ACTIVE'?'success':'danger'}`}>{u.account_status}</span>,money(u.available_balance),dateTime(u.created_at),u.role==='admin'?'Admin':<button className="btn small" onClick={()=>setStatus(u.id,u.account_status==='ACTIVE'?'SUSPENDED':'ACTIVE')}>{u.account_status==='ACTIVE'?'Suspend':'Activate'}</button>])}/></Card>}
    {tab==='deposits'&&<Card><Table headers={['User','Package','Amount','Method / TxID','Status','Submitted','Actions']} rows={data.deposits.map(d=>[d.user_id.slice(0,8),d.package_name,money(d.amount),<div><div>{d.method}</div><code>{shortId(d.txid)}</code></div>,<span className={`pill ${d.status==='APPROVED'?'success':d.status==='REJECTED'?'danger':''}`}>{d.status}</span>,dateTime(d.submitted_at),d.status==='PENDING'?<div className="action-inline"><button className="btn small success-btn" onClick={()=>approveDeposit(d.id)}>Approve</button><button className="btn small danger-btn" onClick={()=>rejectDeposit(d.id)}>Reject</button>{d.proof_path&&<ProofButton path={d.proof_path}/>}</div>:d.proof_path&&<ProofButton path={d.proof_path}/>])}/></Card>}
    {tab==='withdrawals'&&<Card><Table headers={['User','Amount','Method','Destination','Status','Requested','Actions']} rows={data.withdrawals.map(w=>[w.username,money(w.amount),w.method,<code>{shortId(w.destination)}</code>,<span className={`pill ${w.status==='SENT'?'success':w.status==='REJECTED'?'danger':''}`}>{w.status}</span>,dateTime(w.requested_at),w.status==='PENDING'?<div className="action-inline"><button className="btn small success-btn" onClick={()=>sendWithdrawal(w.id)}>Mark sent</button><button className="btn small danger-btn" onClick={()=>rejectWithdrawal(w.id)}>Reject</button></div>:<span className="muted tiny">{w.payout_txid?shortId(w.payout_txid):'—'}</span>])}/></Card>}
    {tab==='donations'&&<Card><Table headers={['Donor','Amount','Method','TxID','Status','Submitted','Actions']} rows={data.donations.map(d=>[d.is_anonymous?'Anonymous':(d.donor_name||'—'),money(d.amount),d.method,<code>{shortId(d.txid||'')}</code>,<span className={`pill ${d.status==='VERIFIED'?'success':d.status==='REJECTED'?'danger':''}`}>{d.status}</span>,dateTime(d.submitted_at),d.status==='PENDING'?<div className="action-inline"><button className="btn small success-btn" onClick={()=>verifyDonation(d.id)}>Verify</button><button className="btn small danger-btn" onClick={()=>rejectDonation(d.id)}>Reject</button></div>:<span className="muted tiny">—</span>])}/></Card>}
    {tab==='payment'&&<Card><form onSubmit={saveSettings} className="form-grid"><Field label="Binance Pay ID" value={localSettings.binance_pay_id} set={v=>setLocalSettings(s=>({...s,binance_pay_id:v}))}/><Field label="USDT TRC20 address" value={localSettings.trc20_address} set={v=>setLocalSettings(s=>({...s,trc20_address:v}))}/><Field label="USDT BEP20 address" value={localSettings.bep20_address} set={v=>setLocalSettings(s=>({...s,bep20_address:v}))}/><Field label="Binance Pay QR URL" value={localSettings.binance_qr_url} set={v=>setLocalSettings(s=>({...s,binance_qr_url:v}))}/><Field label="TRC20 QR URL" value={localSettings.trc20_qr_url} set={v=>setLocalSettings(s=>({...s,trc20_qr_url:v}))}/><Field label="BEP20 QR URL" value={localSettings.bep20_qr_url} set={v=>setLocalSettings(s=>({...s,bep20_qr_url:v}))}/><Field label="Minimum deposit" type="number" value={localSettings.min_deposit} set={v=>setLocalSettings(s=>({...s,min_deposit:Number(v)}))}/><Field label="Minimum donation" type="number" value={localSettings.min_donation} set={v=>setLocalSettings(s=>({...s,min_donation:Number(v)}))}/><Field label="Minimum withdrawal" type="number" value={localSettings.min_withdrawal} set={v=>setLocalSettings(s=>({...s,min_withdrawal:Number(v)}))}/><Field label="Instructions" value={localSettings.instructions} set={v=>setLocalSettings(s=>({...s,instructions:v}))} wide/><label className="check"><input type="checkbox" checked={localSettings.binance_enabled} onChange={e=>setLocalSettings(s=>({...s,binance_enabled:e.target.checked}))}/> Binance Pay enabled</label><label className="check"><input type="checkbox" checked={localSettings.trc20_enabled} onChange={e=>setLocalSettings(s=>({...s,trc20_enabled:e.target.checked}))}/> TRC20 enabled</label><label className="check"><input type="checkbox" checked={localSettings.bep20_enabled} onChange={e=>setLocalSettings(s=>({...s,bep20_enabled:e.target.checked}))}/> BEP20 enabled</label><div className="span-2 notice">Receiving addresses are intentionally blank until you enter your real values here. Every payment-settings update is audited.</div><div className="span-2"><button className="btn primary" disabled={busy}>{busy?'Saving…':'Save payment settings'}</button></div></form></Card>}
    {tab==='packages'&&<PackageAdmin packages={packages} refresh={refresh} notify={notify}/>}
    {tab==='audit'&&<Card><Table headers={['Action','Target','Note','Time']} rows={data.audit.map(a=>[a.action,a.target,a.note||'—',dateTime(a.created_at)])}/></Card>}
  </div>;
}

function PackageAdmin({ packages, refresh, notify }) {
  const [drafts,setDrafts]=useState(packages); useEffect(()=>setDrafts(packages),[packages]);
  const save=async p=>{try{const {error}=await supabase.rpc('admin_update_package',{p_package_id:p.id,p_deposit:Number(p.deposit),p_daily_accrual:Number(p.daily_accrual),p_duration_days:Number(p.duration_days),p_status:p.status});if(error)throw error;notify(`${p.name} updated`);await refresh();}catch(e){notify(errorMessage(e),'error');}};
  return <div className="package-admin">{drafts.map(p=><Card key={p.id}><div className="row-between"><b>{p.name}</b><select value={p.status} onChange={e=>setDrafts(ds=>ds.map(x=>x.id===p.id?{...x,status:e.target.value}:x))}><option>ACTIVE</option><option>INACTIVE</option></select></div><div className="form-grid compact"><Field label="Deposit" type="number" value={p.deposit} set={v=>setDrafts(ds=>ds.map(x=>x.id===p.id?{...x,deposit:v}:x))}/><Field label="Daily accrual" type="number" value={p.daily_accrual} set={v=>setDrafts(ds=>ds.map(x=>x.id===p.id?{...x,daily_accrual:v}:x))}/><Field label="Duration days" type="number" value={p.duration_days} set={v=>setDrafts(ds=>ds.map(x=>x.id===p.id?{...x,duration_days:v}:x))}/><div className="field-end"><button className="btn primary small" onClick={()=>save(p)}>Save</button></div></div></Card>)}</div>;
}
function Field({label,value,set,type='text',wide=false}) { return <label className={wide?'span-2':''}>{label}<input type={type} value={value??''} onChange={e=>set(e.target.value)}/></label>; }
function CopyButton({value,notify}) { return <button type="button" className="icon-btn" onClick={async()=>{try{await navigator.clipboard.writeText(value);notify('Copied')}catch{notify('Copy failed','error')}}}><Copy size={16}/></button>; }
function ProofButton({path}) { return <button className="btn small" onClick={async()=>{try{const {data,error}=await supabase.storage.from('payment-proofs').createSignedUrl(path,300);if(error)throw error;window.open(data.signedUrl,'_blank','noopener,noreferrer');}catch(e){alert(errorMessage(e));}}}><Eye size={14}/></button>; }

function LegalPage({kind}) { const map={risk:['Risk disclosure','Package figures shown on this website are configurable plan values. They are not guarantees, promises of profit, or a representation that losses cannot occur. Only use funds you can afford to risk.'],terms:['Terms of use','Deposits are manually verified. Withdrawals are manually processed. Users must submit accurate TxIDs and destination details. Administrators may reject invalid, duplicate or unsupported requests.'],privacy:['Privacy','Account information is stored in the application database. Payment proof files are stored in a private Supabase Storage bucket and are not public by default.']} ; const [title,text]=map[kind]||['Legal','']; return <div className="container section"><Card><div className="eyebrow">LEGAL</div><h2>{title}</h2><p className="muted">{text}</p></Card></div>; }
function Footer({go}) { return <footer><div className="container footer-grid"><div><div className="brand footer-brand"><span className="logo"><Crown size={20}/></span>INTERNATIONAL LIONPROFIT</div><p className="muted tiny">Database-backed account ledger with manual payment verification.</p></div><div className="footer-links"><button onClick={()=>go('risk')}>Risk</button><button onClick={()=>go('terms')}>Terms</button><button onClick={()=>go('privacy')}>Privacy</button></div></div><div className="container footer-bottom">© {new Date().getFullYear()} International LionProfit Company.</div></footer>; }

export default App;
