import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function AppShell() {
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-16">
      <Outlet />
      <BottomNav />
    </div>
  );
}
