/**
 * Login Page
 *
 * Public page where users can sign in or sign up.
 */

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import LoginForm from '@/components/Auth/LoginForm';

export default function Login() {
  const { user, loading } = useAuth();

  useEffect(() => {
    // Redirect to dashboard if already logged in
    if (user && !loading) {
      window.location.href = '/';
    }
  }, [user, loading]);

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <LoginForm onSuccess={() => (window.location.href = '/')} />
      </div>
    );
  }

  return null;
}
