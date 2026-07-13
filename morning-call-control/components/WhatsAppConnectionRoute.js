'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Building2, LoaderCircle, WifiOff } from 'lucide-react';
import { ConsultationConnectionPage } from '@/components/ConsultationPages';
import { db, hasFirebaseConfig } from '@/lib/firebase';

export default function WhatsAppConnectionRoute({ companyId, collectionName, moduleName }) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadCompany() {
      if (!hasFirebaseConfig() || !db) {
        setError('Firebase nao configurado para carregar a empresa.');
        setLoading(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, collectionName, companyId));

        if (!active) return;

        if (!snapshot.exists()) {
          setError(`Empresa nao encontrada no ${moduleName}.`);
          return;
        }

        setCompany({ id: snapshot.id, ...snapshot.data() });
      } catch (requestError) {
        if (active) {
          setError(requestError.message || 'Nao foi possivel carregar a empresa.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCompany();

    return () => {
      active = false;
    };
  }, [collectionName, companyId, moduleName]);

  return (
    <main className="connectionStandalone">
      {loading ? (
        <div className="connectionStandaloneState" role="status">
          <LoaderCircle className="spinning" size={42} />
          <span>Carregando conexao...</span>
        </div>
      ) : error ? (
        <div className="connectionStandaloneState error" role="alert">
          <WifiOff size={42} />
          <strong>{error}</strong>
        </div>
      ) : company ? (
        <ConsultationConnectionPage company={company} />
      ) : (
        <div className="connectionStandaloneState" role="alert">
          <Building2 size={42} />
          <strong>Empresa nao encontrada.</strong>
        </div>
      )}
    </main>
  );
}
