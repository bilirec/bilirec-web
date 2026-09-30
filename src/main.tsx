import { createRoot } from 'react-dom/client'
import { withErrorBoundary } from "react-error-boundary";
import "@/i18n";

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import "./main.css"
import "./styles/theme.css"
import "./index.css"
import "./styles/danmaku.css"
import { FallbackProps } from 'react-error-boundary';

const AppWithErrorBoundary = withErrorBoundary(App, { 
  fallbackRender: (props: FallbackProps) => <ErrorFallback {...props} /> 
});

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    {/* @ts-ignore - next-themes children typing mismatch */}
    <ThemeProvider attribute="data-appearance" defaultTheme="system">
      <AppWithErrorBoundary />
    </ThemeProvider>
  </QueryClientProvider>
)    
