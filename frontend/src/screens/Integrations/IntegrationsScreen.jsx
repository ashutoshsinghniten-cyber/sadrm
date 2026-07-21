import React from 'react';
import { PageHeader } from '../../components/shared/PageHeader.jsx';
import SettingsIntegrations from '../Settings/SettingsIntegrations.jsx';

export default function IntegrationsScreen({ buckets = [], setBuckets = () => {}, activeBucketId = null, setActiveBucketId = () => {}, batches = [] }) {
  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-4 md:p-6">
        <PageHeader title="Integrations" eyebrow="ADMIN" description="S3 Buckets, External Services, and API Keys" />
        <SettingsIntegrations buckets={buckets} setBuckets={setBuckets} activeBucketId={activeBucketId} setActiveBucketId={setActiveBucketId} batches={batches} />
      </div>
    </div>
  );
}
