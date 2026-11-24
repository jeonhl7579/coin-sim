import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MainPage } from '@/pages/MainPage';

describe('MainPage', () => {
  it('메인 제목을 보여 준다', () => {
    render(<MainPage />);
    expect(screen.getByRole('heading', { name: /메인/ })).toBeInTheDocument();
  });
});
