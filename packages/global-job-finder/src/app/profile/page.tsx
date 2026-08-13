'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Car, 
  BookOpen, 
  Briefcase, 
  Award, 
  Plus, 
  Trash2, 
  Save, 
  FileText, 
  Check, 
  Sparkles,
  DollarSign,
  Upload,
  RefreshCw,
  FileCheck2,
  X,
  Eye,
  Settings,
  GraduationCap,
  Globe,
  CheckCircle,
  Calendar,
  Languages,
  Image as ImageIcon
} from 'lucide-react';

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Form State
  const [name, setName] = useState('Lukas Weber');
  const [email, setEmail] = useState('lukas@beispiel.de');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [phone, setPhone] = useState('+49 176 12345678');
  const [address, setAddress] = useState('Friedrichstraße 42');
  const [city, setCity] = useState('Berlin');
  const [postalCode, setPostalCode] = useState('10117');
  const [country, setFederalState] = useState('Berlin');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [placeOfBirth, setPlaceOfBirth] = useState('');
  const [drivingLicense, setDrivingLicense] = useState('Klasse B (PKW)');
  const [bio, setBio] = useState('Professionnel motivé, prêt à rejoindre une équipe internationale.');
  const [salaryExpectation, setSalaryExpectation] = useState('1.200 € / Mois');
  const [remotePreference, setRemotePreference] = useState(true);

  // CV File State
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Arrays
  const [languages, setLanguages] = useState<string[]>([]);
  const [educations, setEducations] = useState<any[]>([]);
  const [experiences, setExperiences] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);

  // Modals / New Item inputs
  const [newLangName, setNewLangName] = useState('');
  const [newLangLevel, setNewLangLevel] = useState('Langue maternelle');

  const [newEduDegree, setNewEduDegree] = useState('');
  const [newEduInst, setNewEduInst] = useState('');
  const [newEduYear, setNewEduYear] = useState('');
  const [newEduEndDate, setNewEduEndDate] = useState('');
  const [newEduCurrent, setNewEduCurrent] = useState(false);
  const [newEduDesc, setNewEduDesc] = useState('');
  
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpCompany, setNewExpCompany] = useState('');
  const [newExpYear, setNewExpYear] = useState('');
  const [newExpEndDate, setNewExpEndDate] = useState('');
  const [newExpCurrent, setNewExpCurrent] = useState(false);
  const [newExpDesc, setNewExpDesc] = useState('');

  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState('Intermediate');
  const [newSkillCategory, setNewSkillCategory] = useState('Général');

  useEffect(() => {
    fetch('/api/profile')
      .then(res => res.json())
      .then(data => {
        if (data.profile) {
          const p = data.profile;
          setPhone(p.phone || '');
          setAddress(p.address || '');
          setCity(p.city || '');
          setPostalCode(p.postalCode || '');
          setFederalState(p.country || '');
          setDateOfBirth(p.dateOfBirth || '');
          setPlaceOfBirth(p.placeOfBirth || '');
          setDrivingLicense(p.drivingLicense || 'Klasse B (PKW)');
          setBio(p.bio || '');
          setSalaryExpectation(p.salaryExpectation || '');
          setRemotePreference(p.remotePreference ?? true);
          setCvFileName(p.cvFileName || null);
          setEducations(p.educations || []);
          setExperiences(p.experiences || []);
          setSkills(p.skills || []);

          if (p.languages) {
            try {
              const parsedLangs = typeof p.languages === 'string' ? JSON.parse(p.languages) : p.languages;
              setLanguages(Array.isArray(parsedLangs) ? parsedLangs : [parsedLangs]);
            } catch {
              setLanguages([p.languages]);
            }
          }
          
          if (p.user) {
            setName(p.user.name || '');
            setEmail(p.user.email || '');
            setAvatarUrl(p.user.avatarUrl || '');
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          avatarUrl,
          phone,
          address,
          city,
          postalCode,
          country,
          dateOfBirth,
          placeOfBirth,
          drivingLicense,
          bio,
          salaryExpectation,
          remotePreference,
          languages: JSON.stringify(languages),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMsg('Profil mis à jour avec succès !');
        setTimeout(() => setMsg(''), 4000);
      }
    } catch (err) {
      setMsg("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleCvBoxClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCv(true);
    setMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/profile/upload-cv', {
        method: 'POST',
        body: formData,
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = {};

      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('Non-JSON response from server:', text);
        throw new Error(`Erreur serveur (${res.status}). Fichier trop volumineux ou non supporté.`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Erreur lors de l'importation du CV (${res.status})`);
      }

      setCvFileName(data.fileName);
      const p = data.profile;
      if (p) {
        setPhone(p.phone || '');
        setAddress(p.address || '');
        setCity(p.city || '');
        setPostalCode(p.postalCode || '');
        setFederalState(p.country || '');
        setDateOfBirth(p.dateOfBirth || '');
        setPlaceOfBirth(p.placeOfBirth || '');
        setDrivingLicense(p.drivingLicense || 'Klasse B (PKW)');
        setBio(p.bio || '');
        setSalaryExpectation(p.salaryExpectation || '');
        setRemotePreference(p.remotePreference ?? true);
        setEducations(p.educations || []);
        setExperiences(p.experiences || []);
        setSkills(p.skills || []);

        if (p.languages) {
          try {
            const parsedLangs = typeof p.languages === 'string' ? JSON.parse(p.languages) : p.languages;
            setLanguages(Array.isArray(parsedLangs) ? parsedLangs : [parsedLangs]);
          } catch {
            setLanguages([p.languages]);
          }
        }

        if (p.user?.name) {
          setName(p.user.name);
        }
        if (p.user?.avatarUrl) {
          setAvatarUrl(p.user.avatarUrl);
        }
      }
      setMsg(`CV "${data.fileName}" importé et analysé avec succès ! Vos données ont été mises à jour.`);
      setTimeout(() => setMsg(''), 6000);
    } catch (err: any) {
      setMsg(err.message || "Erreur lors du téléchargement du fichier.");
    } finally {
      setUploadingCv(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveCv = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch('/api/profile/upload-cv', { method: 'DELETE' });
      if (!response.ok) throw new Error('Suppression impossible.');
      setCvFileName(null);
      setMsg("CV supprimé avec succès.");
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {}
  };

  const addLanguage = () => {
    if (!newLangName) return;
    const formatted = `${newLangName} (${newLangLevel})`;
    setLanguages(prev => [...prev, formatted]);
    setNewLangName('');
  };

  const deleteLanguage = (index: number) => {
    setLanguages(prev => prev.filter((_, i) => i !== index));
  };

  const addEducation = async () => {
    if (!newEduDegree || !newEduInst) return;
    try {
      const res = await fetch('/api/profile/education', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          degree: newEduDegree,
          institution: newEduInst,
          startDate: newEduYear || '2021',
          endDate: newEduCurrent ? 'Présent' : (newEduEndDate || '2025'),
          current: newEduCurrent,
          description: newEduDesc,
        }),
      });
      const data = await res.json();
      if (data.education) {
        setEducations(prev => [...prev, data.education]);
        setNewEduDegree('');
        setNewEduInst('');
        setNewEduYear('');
        setNewEduEndDate('');
        setNewEduCurrent(false);
        setNewEduDesc('');
      }
    } catch (err) {}
  };

  const deleteEducation = async (id: string) => {
    await fetch(`/api/profile/education?id=${id}`, { method: 'DELETE' });
    setEducations(prev => prev.filter(e => e.id !== id));
  };

  const addExperience = async () => {
    if (!newExpTitle || !newExpCompany) return;
    try {
      const res = await fetch('/api/profile/experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: newExpTitle,
          company: newExpCompany,
          startDate: newExpYear || '2022',
          endDate: newExpCurrent ? 'Présent' : (newExpEndDate || '2024'),
          current: newExpCurrent,
          description: newExpDesc,
        }),
      });
      const data = await res.json();
      if (data.experience) {
        setExperiences(prev => [...prev, data.experience]);
        setNewExpTitle('');
        setNewExpCompany('');
        setNewExpYear('');
        setNewExpEndDate('');
        setNewExpCurrent(false);
        setNewExpDesc('');
      }
    } catch (err) {}
  };

  const deleteExperience = async (id: string) => {
    await fetch(`/api/profile/experience?id=${id}`, { method: 'DELETE' });
    setExperiences(prev => prev.filter(e => e.id !== id));
  };

  const addSkill = async () => {
    if (!newSkillName) return;
    try {
      const res = await fetch('/api/profile/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSkillName,
          level: newSkillLevel,
          category: newSkillCategory,
        }),
      });
      const data = await res.json();
      if (data.skill) {
        setSkills(prev => [...prev, data.skill]);
        setNewSkillName('');
      }
    } catch (err) {}
  };

  const deleteSkill = async (id: string) => {
    await fetch(`/api/profile/skills?id=${id}`, { method: 'DELETE' });
    setSkills(prev => prev.filter(s => s.id !== id));
  };

  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'C';

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Chargement de votre profil professionnel complet...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.doc,.docx"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header Widget */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-slate-100 via-slate-200/60 to-indigo-100/50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950/40 p-6 md:p-8 border border-slate-200 dark:border-slate-800/80 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 transition-colors duration-200">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
        
        <div className="flex flex-col md:flex-row items-center gap-5 relative z-10 text-center md:text-left">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={name} 
              className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-500/30 shadow-xl shadow-blue-500/20"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white text-3xl shadow-xl shadow-blue-500/20">
              {initials}
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-1">
              <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Profil Candidat & CV
              </span>
              {cvFileName && (
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3" /> CV enregistré et analysé
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{name}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
              {bio ? bio.slice(0, 95) + (bio.length > 95 ? '...' : '') : 'Importez votre CV (PDF, DOC ou DOCX) pour compléter votre profil.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 relative z-10 w-full md:w-auto">
          <button
            onClick={handleCvBoxClick}
            disabled={uploadingCv}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] disabled:opacity-75"
          >
            {uploadingCv ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Analyse IA en cours...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Importer mon CV</span>
              </>
            )}
          </button>

          {activeTab === 'edit' && (
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-700 font-semibold text-sm rounded-xl transition-all shadow-sm"
            >
              <Save className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{saving ? 'Enregistrement...' : 'Sauvegarder'}</span>
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm rounded-2xl flex items-center justify-between shadow-md animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{msg}</span>
          </div>
          <button onClick={() => setMsg('')} className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800/80">
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all ${
            activeTab === 'preview'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-white bg-blue-500/5'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Eye className="w-4.5 h-4.5" />
          <span>Mon CV en Ligne</span>
        </button>
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all ${
            activeTab === 'edit'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-white bg-blue-500/5'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="w-4.5 h-4.5" />
          <span>Modifier les Informations</span>
        </button>
      </div>

      {/* Main Area */}
      {activeTab === 'preview' ? (
        /* Tab 1: CV online design */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column (Details) */}
          <div className="space-y-6">
            {/* Information Card */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-6 shadow-sm dark:shadow-none">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">État Civil & Contact</h3>
                <div className="space-y-3.5">
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-sm truncate">{email || 'Non renseigné'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-sm">{phone || 'Non renseigné'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-sm truncate">
                      {address ? `${address}, ` : ''}{postalCode} {city}
                      {country ? ` (${country})` : ''}
                    </span>
                  </div>

                  {(dateOfBirth || placeOfBirth) && (
                    <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                      <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="text-sm">
                        {dateOfBirth ? `Né(e) le ${dateOfBirth}` : ''}
                        {placeOfBirth ? ` à ${placeOfBirth}` : ''}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <Car className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-sm">Permis : {drivingLicense || 'Non spécifié'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-sm">Prétention : {salaryExpectation || 'Non spécifiée'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-sm">Télétravail : {remotePreference ? 'Accepté' : 'Non souhaité'}</span>
                  </div>
                </div>
              </div>

              {cvFileName && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800/60">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Fichier CV</h3>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">{cvFileName}</span>
                    </div>
                    <button 
                      onClick={handleRemoveCv}
                      className="p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-900 rounded-lg transition-colors"
                      title="Supprimer le CV"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Languages Panel */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Langues Parlées</span>
                <Languages className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </h3>

              {languages.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Aucune langue spécifiée.</p>
              ) : (
                <div className="space-y-2">
                  {languages.map((lang, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      <span>{lang}</span>
                      <Check className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Skills Panel */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Compétences</span>
                <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </h3>

              {skills.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Aucune compétence renseignée.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {skills.map((s) => {
                    const levelColors = s.level === 'Expert' 
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20'
                      : s.level === 'Advanced' 
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20'
                      : 'bg-slate-100 dark:bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/50';

                    return (
                      <span 
                        key={s.id} 
                        className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border ${levelColors}`}
                        title={`Niveau : ${s.level || 'Intermediate'}`}
                      >
                        {s.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column (Bio & Timeline) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Bio Card */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl relative overflow-hidden shadow-sm dark:shadow-none">
              <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-tr from-blue-500/10 to-transparent blur-2xl rounded-full" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Résumé professionnel</h3>
              <p className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-line">
                {bio || 'Aucune description rédigée. Importez votre CV pour générer votre profil professionnel.'}
              </p>
            </div>

            {/* Experience Timeline */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-6 shadow-sm dark:shadow-none">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-slate-800/60 pb-3">
                <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Expériences Professionnelles</span>
              </h3>

              {experiences.length === 0 ? (
                <p className="text-sm text-slate-500 italic py-2">Aucune expérience enregistrée.</p>
              ) : (
                <div className="relative pl-6 border-l border-slate-200 dark:border-slate-800 space-y-8">
                  {experiences.map((exp) => (
                    <div key={exp.id} className="relative group">
                      {/* Timeline Dot */}
                      <span className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white dark:bg-slate-950 border-2 border-blue-600 dark:border-blue-500 group-hover:bg-blue-500 transition-colors" />
                      
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {exp.jobTitle}
                          </h4>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800">
                            {exp.startDate} – {exp.endDate || 'Présent'}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{exp.company}{exp.location ? ` • ${exp.location}` : ''}</p>
                        {exp.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1.5 whitespace-pre-line">
                            {exp.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Education Timeline */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-6 shadow-sm dark:shadow-none">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-slate-800/60 pb-3">
                <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Formations & Diplômes</span>
              </h3>

              {educations.length === 0 ? (
                <p className="text-sm text-slate-500 italic py-2">Aucune formation enregistrée.</p>
              ) : (
                <div className="relative pl-6 border-l border-slate-200 dark:border-slate-800 space-y-8">
                  {educations.map((edu) => (
                    <div key={edu.id} className="relative group">
                      {/* Timeline Dot */}
                      <span className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white dark:bg-slate-950 border-2 border-indigo-600 dark:border-indigo-500 group-hover:bg-indigo-500 transition-colors" />
                      
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {edu.degree}
                          </h4>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800">
                            {edu.startDate} – {edu.endDate || 'Présent'}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {edu.institution}{edu.fieldOfStudy ? ` (${edu.fieldOfStudy})` : ''}
                        </p>
                        {edu.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1.5 whitespace-pre-line">
                            {edu.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: Edit Forms */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Details */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
              <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800/60 pb-2">
                Informations Personnelles & État Civil
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nom complet</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Photo de Profil (URL)</label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Numéro de Téléphone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Adresse</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Ville & Code Postal</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="CP"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="w-24 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Ville"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Région (Land en DE)</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setFederalState(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    placeholder="ex: Berlin, Bayern"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Date de Naissance</label>
                  <input
                    type="text"
                    placeholder="ex: 15/04/2000"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Lieu de Naissance</label>
                  <input
                    type="text"
                    placeholder="ex: Casablanca, Maroc"
                    value={placeOfBirth}
                    onChange={(e) => setPlaceOfBirth(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Permis de Conduire</label>
                  <select
                    value={drivingLicense}
                    onChange={(e) => setDrivingLicense(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Klasse B (PKW)">Permis B (Voiture)</option>
                    <option value="Klasse AM / A1">Permis Moto (AM/A1)</option>
                    <option value="Keiner">Pas de permis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Prétention Salariale</label>
                  <input
                    type="text"
                    value={salaryExpectation}
                    onChange={(e) => setSalaryExpectation(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    placeholder="ex: 1.200 € / Mois"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">À propos de moi / Présentation</label>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  placeholder="Écrivez une brève présentation..."
                />
              </div>
            </div>

            {/* Languages Management */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
              <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800/60 pb-2 flex items-center gap-2">
                <Languages className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Gérer les Langues Parlées</span>
              </h3>

              <div className="flex flex-wrap gap-2">
                {languages.map((lang, idx) => (
                  <span 
                    key={idx} 
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 rounded-xl"
                  >
                    <span>{lang}</span>
                    <button onClick={() => deleteLanguage(idx)} className="text-slate-400 hover:text-rose-500 font-bold ml-1">
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Langue (ex: Français)"
                  value={newLangName}
                  onChange={(e) => setNewLangName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                />
                <select
                  value={newLangLevel}
                  onChange={(e) => setNewLangLevel(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                >
                  <option value="Langue maternelle">Langue maternelle</option>
                  <option value="Courant (C1/C2)">Courant (C1/C2)</option>
                  <option value="Intermédiaire (B1/B2)">Intermédiaire (B1/B2)</option>
                  <option value="Débutant (A1/A2)">Débutant (A1/A2)</option>
                </select>
                <button
                  onClick={addLanguage}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Ajouter la langue
                </button>
              </div>
            </div>

            {/* Experience Management */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
              <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800/60 pb-2">
                Gérer les Expériences Professionnelles
              </h3>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {experiences.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Aucune expérience répertoriée.</p>
                ) : (
                  experiences.map((exp) => (
                    <div key={exp.id} className="p-3 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 rounded-xl flex items-center justify-between gap-4">
                      <div className="overflow-hidden">
                        <h4 className="font-bold text-slate-900 dark:text-white text-xs truncate">{exp.jobTitle}</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {exp.company} • ({exp.startDate} - {exp.endDate || 'Présent'})
                        </p>
                      </div>
                      <button 
                        onClick={() => deleteExperience(exp.id)} 
                        className="text-slate-400 hover:text-rose-500 p-1 hover:bg-slate-200 dark:hover:bg-slate-900 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800/60 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Intitulé du poste (ex: Apprenti Vendeur)"
                    value={newExpTitle}
                    onChange={(e) => setNewExpTitle(e.target.value)}
                    className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Entreprise / Organisation"
                    value={newExpCompany}
                    onChange={(e) => setNewExpCompany(e.target.value)}
                    className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Date de début (ex: 2022 ou Sept 2022)"
                    value={newExpYear}
                    onChange={(e) => setNewExpYear(e.target.value)}
                    className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Date de fin"
                      disabled={newExpCurrent}
                      value={newExpEndDate}
                      onChange={(e) => setNewExpEndDate(e.target.value)}
                      className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white disabled:opacity-50"
                    />
                    <label className="flex items-center gap-1.5 px-2 shrink-0 cursor-pointer text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={newExpCurrent}
                        onChange={(e) => setNewExpCurrent(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-blue-600 bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800"
                      />
                      <span>Actuel</span>
                    </label>
                  </div>
                </div>
                <textarea
                  placeholder="Description succincte des tâches..."
                  rows={2}
                  value={newExpDesc}
                  onChange={(e) => setNewExpDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                />
                <button
                  onClick={addExperience}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Ajouter l'expérience
                </button>
              </div>
            </div>

            {/* Education Management */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
              <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800/60 pb-2">
                Gérer les Formations & Diplômes
              </h3>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {educations.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Aucune formation répertoriée.</p>
                ) : (
                  educations.map((edu) => (
                    <div key={edu.id} className="p-3 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 rounded-xl flex items-center justify-between gap-4">
                      <div className="overflow-hidden">
                        <h4 className="font-bold text-slate-900 dark:text-white text-xs truncate">{edu.degree}</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {edu.institution} • ({edu.startDate} - {edu.endDate || 'Présent'})
                        </p>
                      </div>
                      <button 
                        onClick={() => deleteEducation(edu.id)} 
                        className="text-slate-400 hover:text-rose-500 p-1 hover:bg-slate-200 dark:hover:bg-slate-900 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800/60 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Diplôme (ex: Baccalauréat Scientifique)"
                    value={newEduDegree}
                    onChange={(e) => setNewEduDegree(e.target.value)}
                    className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Établissement (ex: Lycée Descartes)"
                    value={newEduInst}
                    onChange={(e) => setNewEduInst(e.target.value)}
                    className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Année début (ex: 2020)"
                    value={newEduYear}
                    onChange={(e) => setNewEduYear(e.target.value)}
                    className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Année fin (ex: 2023)"
                      disabled={newEduCurrent}
                      value={newEduEndDate}
                      onChange={(e) => setNewEduEndDate(e.target.value)}
                      className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white disabled:opacity-50"
                    />
                    <label className="flex items-center gap-1.5 px-2 shrink-0 cursor-pointer text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={newEduCurrent}
                        onChange={(e) => setNewEduCurrent(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-blue-600 bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800"
                      />
                      <span>Actuel</span>
                    </label>
                  </div>
                </div>
                <textarea
                  placeholder="Détails supplémentaires (options, mention...)"
                  rows={2}
                  value={newEduDesc}
                  onChange={(e) => setNewEduDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                />
                <button
                  onClick={addEducation}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Ajouter la formation
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar (Skills Management inside edit mode) */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
              <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800/60 pb-2 flex items-center gap-2">
                <Award className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Compétences</span>
              </h3>

              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                {skills.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Aucune compétence ajoutée.</p>
                ) : (
                  skills.map((s) => (
                    <span 
                      key={s.id} 
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 rounded-lg"
                    >
                      <span>{s.name}</span>
                      <button 
                        onClick={() => deleteSkill(s.id)} 
                        className="text-slate-400 hover:text-rose-500 font-bold ml-1.5"
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800/60 space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Nom</label>
                  <input
                    type="text"
                    placeholder="ex: Python, Gestion de projet"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Niveau</label>
                  <select
                    value={newSkillLevel}
                    onChange={(e) => setNewSkillLevel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                  >
                    <option value="Beginner">Débutant (Beginner)</option>
                    <option value="Intermediate">Intermédiaire (Intermediate)</option>
                    <option value="Advanced">Avancé (Advanced)</option>
                    <option value="Expert">Expert (Expert)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Catégorie</label>
                  <input
                    type="text"
                    placeholder="ex: IT, Handwerk, Kaufmännisch"
                    value={newSkillCategory}
                    onChange={(e) => setNewSkillCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <button
                  onClick={addSkill}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
