import WhatsAppConnectionRoute from '@/components/WhatsAppConnectionRoute';
import { COLLECTIONS } from '@/lib/constants';

export default function SacWhatsAppConnectionPage({ params }) {
  return (
    <WhatsAppConnectionRoute
      companyId={params.companyId}
      collectionName={COLLECTIONS.sacCompanies}
      moduleName="SAC"
    />
  );
}
