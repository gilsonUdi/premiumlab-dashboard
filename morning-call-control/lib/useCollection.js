'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { dateValue, normalizeFirestoreValue } from '@/lib/format';

export function useCollection(name) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(db));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db) return undefined;

    const ref = collection(db, name);

    return onSnapshot(
      ref,
      snapshot => {
        const rows = snapshot.docs
          .map(item => ({ ...normalizeFirestoreValue(item.data()), id: item.id }))
          .sort((a, b) => {
            const aDate = dateValue(a.updatedAt || a.createdAt);
            const bDate = dateValue(b.updatedAt || b.createdAt);
            return bDate - aDate;
          });

        setItems(rows);
        setLoading(false);
        setError('');
      },
      error => {
        setLoading(false);
        setError(error.message || `Não foi possível carregar ${name}.`);
      }
    );
  }, [name]);

  return { items, loading, error };
}
