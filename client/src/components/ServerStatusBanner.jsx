import { useEffect, useState } from 'react';
import { SERVER_REACHABLE, SERVER_UNREACHABLE } from '../api/client.js';

// Shown while the API isn't answering (typically the free host waking up from sleep), and
// hidden again the moment any request gets through.
export default function ServerStatusBanner() {
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    const down = () => setUnreachable(true);
    const up = () => setUnreachable(false);
    window.addEventListener(SERVER_UNREACHABLE, down);
    window.addEventListener(SERVER_REACHABLE, up);
    return () => {
      window.removeEventListener(SERVER_UNREACHABLE, down);
      window.removeEventListener(SERVER_REACHABLE, up);
    };
  }, []);

  if (!unreachable) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[2000] bg-ink px-4 py-2 text-center text-[13px] text-white">
      Can&apos;t reach the server yet. It may be waking up, which can take up to a minute.
    </div>
  );
}
