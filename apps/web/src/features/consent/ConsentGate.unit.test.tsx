// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsentGate } from './ConsentGate';

afterEach(cleanup);

describe('ConsentGate (biometric consent before any microphone use, RGPD art. 9)', () => {
  it('keeps the gated content unreachable and explains local-only processing while consent is missing', () => {
    render(
      <ConsentGate microphoneConsent={false} onGrantMicrophone={vi.fn()}>
        <button type="button">record</button>
      </ConsentGate>,
    );

    expect(screen.queryByRole('button', { name: 'record' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Ton micro, tes données' })).toBeDefined();
    expect(screen.getByText(/uniquement sur cette machine/)).toBeDefined();
  });

  it('grants consent only through the explicit button', () => {
    const onGrantMicrophone = vi.fn();
    render(
      <ConsentGate microphoneConsent={false} onGrantMicrophone={onGrantMicrophone}>
        <p>gated content</p>
      </ConsentGate>,
    );

    fireEvent.click(screen.getByRole('button', { name: /J'autorise l'utilisation du micro/ }));

    expect(onGrantMicrophone).toHaveBeenCalledTimes(1);
  });

  it('renders the gated content once consent is given', () => {
    render(
      <ConsentGate microphoneConsent={true} onGrantMicrophone={vi.fn()}>
        <p>gated content</p>
      </ConsentGate>,
    );

    expect(screen.getByText('gated content')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Ton micro, tes données' })).toBeNull();
  });
});
