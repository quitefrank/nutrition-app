import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function AppShell() {
  return (
    <div className="min-h-screen bg-black flex justify-center">
      <div className="relative w-full max-w-lg min-h-screen bg-background pb-16">
        <Outlet />
        <BottomNav />
      </div>
    </div>
  );
}
