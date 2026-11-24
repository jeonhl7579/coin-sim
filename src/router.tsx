import { createBrowserRouter, Outlet } from 'react-router';
import { ErrorPage } from '@/pages/ErrorPage';
import { MainPage } from '@/pages/MainPage';
import { PlayPage } from '@/pages/PlayPage';
import { RecordsPage } from '@/pages/RecordsPage';
import { ResultPage } from '@/pages/ResultPage';

// 경로: conventions.md 3장. 루트 errorElement: D-34
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Outlet />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <MainPage /> },
      { path: 'play', element: <PlayPage /> },
      { path: 'result/:recordId', element: <ResultPage /> },
      { path: 'records', element: <RecordsPage /> },
    ],
  },
]);
