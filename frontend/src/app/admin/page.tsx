'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, 
  Users, 
  Briefcase, 
  Cpu, 
  Mail, 
  FileText, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  Server,
  Activity,
  Trash2,
  Search,
  Settings,
  X,
  KeyRound
  ,Building2
} from 'lucide-react';

export default function AdminPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'payments' | 'logs' | 'config'>('overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAdminData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/overview');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Accès refusé.');
      }
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleRoleToggle = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    setActionLoading(userId);
    setMsg('');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setMsg(`Rôle mis à jour avec succès : ${newRole}`);
        fetchAdminData();
      } else {
        setError(json.error || 'Échec du changement de rôle');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePlanChange = async (userId: string, subscriptionPlan: string) => {
    setActionLoading(userId);
    setMsg('');
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, subscriptionPlan }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Échec de la modification de la formule.');
      }
      setMsg(`Formule ${subscriptionPlan} activée et quotas réinitialisés.`);
      await fetchAdminData();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Échec de la modification de la formule.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur "${userName}" ?`)) return;

    setActionLoading(userId);
    setMsg('');

    try {
      const res = await fetch(`/api/admin/users?userId=${userId}`, {
        method: 'DELETE',
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setMsg(`Utilisateur "${userName}" supprimé avec succès.`);
        fetchAdminData();
      } else {
        setError(json.error || 'Échec de la suppression');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePayment = async (paymentId: string, action: 'approve' | 'reject') => {
    const note = action === 'reject'
      ? window.prompt('Motif du refus (facultatif) :') || ''
      : '';
    if (action === 'approve' && !window.confirm('Confirmer la réception du virement et activer la formule ?')) return;
    setActionLoading(paymentId);
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, action, note }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Le paiement n’a pas pu être traité.');
      setMsg(`${json.message}${json.emailWarning ? ' L’e-mail utilisateur n’a pas pu être envoyé.' : ''}`);
      await fetchAdminData();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Le paiement n’a pas pu être traité.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = data?.users?.filter((u: any) => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold">Chargement de la Console d'Administration...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-6">
        <div className="p-8 bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-sm rounded-3xl shadow-xl space-y-4">
          <AlertTriangle className="w-10 h-10 mx-auto text-rose-600 dark:text-rose-400 animate-pulse" />
          <h2 className="font-extrabold text-xl text-slate-900 dark:text-white">Accès Réservé aux Administrateurs</h2>
          <p className="text-xs text-rose-700 dark:text-rose-300/80 max-w-md mx-auto">
            {error} (Seuls les comptes disposant du rôle <strong>ADMIN</strong> peuvent accéder à la console de supervision).
          </p>

          <Link
            href="/dashboard"
            className="inline-flex px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm dark:shadow-none">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" /> Administration & Governance AI
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
            Console de Gestion Administrateur
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Gestion globale des utilisateurs, surveillance du moteur de matching et statut des services
          </p>
        </div>

        <button
          onClick={fetchAdminData}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-300 dark:border-slate-700 transition-all shadow-sm"
        >
          <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Actualiser les données
        </button>
      </div>

      {msg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm rounded-2xl flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold">{msg}</span>
          </div>
          <button onClick={() => setMsg('')} className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Utilisateurs</span>
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{data?.stats?.totalUsers || 0}</p>
        </div>

        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Offres Officielles</span>
            <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{data?.stats?.totalOffers || 0}</p>
        </div>

        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Candidatures</span>
            <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{data?.stats?.totalApplications || 0}</p>
        </div>

        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">File & Worker</span>
            <Cpu className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-sm font-extrabold text-amber-600 dark:text-amber-400 mt-2">
            {data?.queueInfo?.redisConnected ? 'Redis Connecté' : 'Planificateur Actif'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800/80">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all ${
            activeTab === 'overview'
              ? 'border-rose-600 dark:border-rose-500 text-rose-600 dark:text-white bg-rose-500/5'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Activity className="w-4.5 h-4.5" />
          <span>Vue d'ensemble</span>
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all ${
            activeTab === 'users'
              ? 'border-rose-600 dark:border-rose-500 text-rose-600 dark:text-white bg-rose-500/5'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-4.5 h-4.5" />
          <span>Gestion des Utilisateurs</span>
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all ${
            activeTab === 'config'
              ? 'border-rose-600 dark:border-rose-500 text-rose-600 dark:text-white bg-rose-500/5'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="w-4.5 h-4.5" />
          <span>Configuration & Services</span>
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all ${
            activeTab === 'payments'
              ? 'border-rose-600 dark:border-rose-500 text-rose-600 dark:text-white bg-rose-500/5'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4.5 h-4.5" />
          <span>Virements</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'users' || activeTab === 'overview' ? (
        <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl space-y-6 shadow-sm dark:shadow-none">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Comptes Utilisateurs Inscrits</span>
            </h3>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Rechercher par nom/email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">Nom du candidat</th>
                  <th className="p-3.5">Adresse E-Mail</th>
                  <th className="p-3.5">Rôle</th>
                  <th className="p-3.5">Abonnement</th>
                  <th className="p-3.5">Mode d'authentification</th>
                  <th className="p-3.5">Date de création</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-slate-800 dark:text-slate-200">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500 italic">
                      Aucun utilisateur trouvé.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u: any) => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">{u.name}</td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400">{u.email}</td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase ${
                          u.role === 'ADMIN' 
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <select
                          value={u.subscriptionPlan || 'BASIC'}
                          onChange={(event) => handlePlanChange(u.id, event.target.value)}
                          disabled={actionLoading === u.id}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          title={u.subscriptionRequestedPlan
                            ? `Demande en attente : ${u.subscriptionRequestedPlan}`
                            : 'Formule active'}
                        >
                          <option value="BASIC">Découverte</option>
                          <option value="PLUS">Plus</option>
                          <option value="PRO">Pro</option>
                        </select>
                        {u.subscriptionRequestedPlan && (
                          <p className="mt-1 text-[9px] font-bold text-amber-600">
                            Demande : {u.subscriptionRequestedPlan}
                          </p>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-500 dark:text-slate-400">
                        {u.isGoogleLogin ? 'OAuth Google (Gmail)' : u.isMicrosoftLogin ? 'OAuth Microsoft' : 'E-Mail & Mot de passe'}
                      </td>
                      <td className="p-3.5 text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleRoleToggle(u.id, u.role)}
                          disabled={actionLoading === u.id}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 rounded-lg font-bold text-[10px] transition-colors"
                          title="Changer le rôle USER / ADMIN"
                        >
                          {u.role === 'ADMIN' ? 'Rétrograder User' : 'Promouvoir Admin'}
                        </button>

                        <button
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          disabled={actionLoading === u.id}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 rounded-lg font-bold transition-colors"
                          title="Supprimer l'utilisateur"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === 'payments' && (
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl space-y-5 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Paiements par virement bancaire
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 uppercase">
                <tr>
                  <th className="p-3">Client</th>
                  <th className="p-3">Référence</th>
                  <th className="p-3">Achat</th>
                  <th className="p-3">Montant</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Créé le</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {!data?.bankPayments?.length ? (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-500">Aucun paiement.</td></tr>
                ) : data.bankPayments.map((payment: any) => (
                  <tr key={payment.id}>
                    <td className="p-3"><strong>{payment.user.name}</strong><br /><span className="text-slate-500">{payment.user.email}</span></td>
                    <td className="p-3 font-mono font-bold">{payment.reference}</td>
                    <td className="p-3 font-bold">
                      {payment.kind === 'CREDIT_TOPUP'
                        ? `${Number(payment.creditAmount).toLocaleString('fr-FR')} crédits IA`
                        : `Formule ${payment.plan}`}
                    </td>
                    <td className="p-3">{Number(payment.amountEur).toFixed(2)} EUR</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        payment.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-600'
                          : payment.status === 'SUBMITTED' ? 'bg-amber-500/10 text-amber-600'
                            : payment.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-600'
                              : 'bg-blue-500/10 text-blue-600'
                      }`}>{payment.status}</span>
                    </td>
                    <td className="p-3 text-slate-500">{new Date(payment.createdAt).toLocaleString('fr-FR')}</td>
                    <td className="p-3 text-right space-x-2">
                      {['PENDING', 'SUBMITTED'].includes(payment.status) ? (
                        <>
                          <button onClick={() => handlePayment(payment.id, 'approve')} disabled={actionLoading === payment.id} className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white disabled:opacity-50">Valider</button>
                          <button onClick={() => handlePayment(payment.id, 'reject')} disabled={actionLoading === payment.id} className="rounded-lg bg-rose-600 px-3 py-2 font-bold text-white disabled:opacity-50">Refuser</button>
                        </>
                      ) : <span className="text-slate-400">Traité</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Configuration & Services Tab */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl space-y-4 shadow-sm dark:shadow-none">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Configurations SMTP Utilisateurs</span>
            </h3>

            <div className="space-y-3">
              {data?.smtpConfigs?.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Aucune configuration SMTP enregistrée.</p>
              ) : (
                data?.smtpConfigs?.map((s: any) => (
                  <div key={s.id} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">{s.provider} ({s.host}:{s.port})</span>
                      <p className="text-[10px] text-slate-500">{s.authUser}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      s.isTested ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                    }`}>
                      {s.isTested ? 'Testé & Valide' : 'Non Testé'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl space-y-4 shadow-sm dark:shadow-none">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Clé & Service OpenAI</span>
            </h3>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-300">Modèle configuré :</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                  {data?.openai?.model || 'gpt-4o-mini'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-300">Analyse de CV PDF :</span>
                <span className={`font-bold ${data?.openai?.configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {data?.openai?.configured ? 'Actif (pdf-parse + IA)' : 'Mode local (clé absente)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-300">Génération de lettre de motivation :</span>
                <span className={`font-bold ${data?.openai?.configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {data?.openai?.configured ? 'Actif' : 'Modèle local de secours'}
                </span>
              </div>
              <p className="border-t border-slate-200 pt-2 text-[10px] font-semibold text-slate-500 dark:border-slate-800">
                Coût OpenAI mesuré : ${(data?.openai?.usage?.estimatedCostUsd || 0).toFixed(4)}
                {' · '}{data?.openai?.usage?.totalTokens || 0} jetons
                {' · '}estimation/candidature : ${Number(data?.openai?.applicationCostEstimate?.typicalCostUsd || 0).toFixed(6)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Logs section */}
      {activeTab === 'overview' || activeTab === 'logs' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* System Logs */}
          <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl space-y-4 shadow-sm dark:shadow-none">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Journaux du Système (System Logs)</span>
            </h3>

            <div className="space-y-2 text-xs font-mono max-h-72 overflow-y-auto pr-2">
              {data?.systemLogs?.map((log: any) => (
                <div key={log.id} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">[{log.source}]</span>
                    <span className="text-[10px] text-slate-500">{new Date(log.createdAt).toLocaleTimeString('fr-FR')}</span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-300 leading-snug">{log.message}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Queue Jobs Monitor */}
          <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl space-y-4 shadow-sm dark:shadow-none">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Tâches de Recherche Auto (BullMQ)</span>
            </h3>

            <div className="space-y-2 text-xs font-mono max-h-72 overflow-y-auto pr-2">
              {data?.queueJobs?.map((job: any) => (
                <div key={job.id} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">{job.jobName}</span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{job.result || 'Recherche automatique toutes les 30 min'}</p>
                  </div>
                  <span className="px-2.5 py-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 rounded-lg border border-emerald-300 dark:border-emerald-800/60">
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
