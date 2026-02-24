import { NavLink } from 'react-router-dom';
import { CalendarDays, UtensilsCrossed, BookOpen, ShoppingCart, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/today', icon: CalendarDays, label: 'Today' },
  { to: '/foods', icon: UtensilsCrossed, label: 'Foods' },
  { to: '/recipes', icon: BookOpen, label: 'Recipes' },
  { to: '/groceries', icon: ShoppingCart, label: 'Groceries' },
  { to: '/ai', icon: Camera, label: 'AI' },
];

export function BottomNav() {
  return (
    <nav className="absolute bottom-0 left-0 right-0 z-50 border-t bg-card">
      <div className="flex">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                isActive ? 'text-primary font-semibold' : 'text-muted-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
