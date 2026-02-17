import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { UtensilsCrossed } from 'lucide-react';

export default function Landing() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/today" replace />;

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Check your email to confirm your account.');
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) toast.error(error.message);
  };

  const handleMagicLink = async () => {
    if (!email) { toast.error('Enter your email first.'); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else toast.success('Magic link sent! Check your email.');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <UtensilsCrossed className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">MacroLite</h1>
        <p className="text-muted-foreground">Track macros, build recipes, eat smarter.</p>
      </div>

      <Card className="w-full max-w-sm">
        <Tabs defaultValue="signin">
          <CardHeader className="pb-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
          </CardHeader>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn}>
              <CardContent className="space-y-3">
                <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                <Button className="w-full" type="submit" disabled={submitting}>Sign In</Button>
                <Button variant="ghost" className="w-full text-xs" type="button" onClick={handleMagicLink} disabled={submitting}>
                  Send Magic Link instead
                </Button>
              </CardContent>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp}>
              <CardContent className="space-y-3">
                <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <Input placeholder="Password (min 6 chars)" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                <Button className="w-full" type="submit" disabled={submitting}>Create Account</Button>
              </CardContent>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
