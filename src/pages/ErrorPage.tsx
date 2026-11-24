import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

// 루트 errorElement (D-34). 문구는 임시이며 8단계에서 다듬는다.
export function ErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main>
      <h1>{notFound ? '페이지를 찾을 수 없어요' : '문제가 생겼어요'}</h1>
      <Link to="/">메인으로</Link>
    </main>
  );
}
