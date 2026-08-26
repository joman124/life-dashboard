'use client';

// ConnectorPanel — the Connectors card in the Track tab.
//
// Each connector owns its own state, fetching, and error surface, so a failure
// in one never blanks the other. This file just composes them.

import BriefConnector from './connectors/BriefConnector';
import GoogleConnector from './connectors/GoogleConnector';
import HealthConnector from './connectors/HealthConnector';

export default function ConnectorPanel({ refresh }: { refresh: () => Promise<void> }) {
  return (
    <section className="card p-4">
      <div className="eyebrow">Connectors</div>
      <GoogleConnector refresh={refresh} />
      <HealthConnector refresh={refresh} />
      {/* Read-only: it pushes nothing into the dashboard, so no refresh to pass. */}
      <BriefConnector />
    </section>
  );
}
