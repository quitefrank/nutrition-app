import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ServiceWorkerRegistrar } from './ServiceWorkerRegistrar';

// ─── Supabase mock ────────────────────────────────────────────────────────────
// vi.mock is hoisted to the top of the file; variables inside the factory must
// be declared with vi.hoisted() to avoid temporal dead zone errors.

const { mockEq, mockUpdate, mockDelete, mockFrom } = vi.hoisted(() => {
  const eq = vi.fn().mockResolvedValue({});
  const update = vi.fn().mockReturnValue({ eq });
  const del = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update, delete: del });
  return { mockEq: eq, mockUpdate: update, mockDelete: del, mockFrom: from };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

// ─── SW installation helpers ──────────────────────────────────────────────────

type MessageHandler = (event: MessageEvent) => void;

/** Install a fake navigator.serviceWorker that captures message listeners. */
function installServiceWorker() {
  const messageListeners: MessageHandler[] = [];
  const mockRegistration = { update: vi.fn().mockResolvedValue(undefined) };
  const mockRegister = vi.fn().mockResolvedValue(mockRegistration);

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: mockRegister,
      addEventListener: vi.fn((type: string, handler: MessageHandler) => {
        if (type === 'message') messageListeners.push(handler);
      }),
      controller: null,
    },
    writable: true,
    configurable: true,
  });

  return { mockRegister, mockRegistration, messageListeners };
}

/** Fire a message event at every registered SW message listener. */
function fireSwMessage(listeners: MessageHandler[], data: unknown) {
  const event = new MessageEvent('message', { data });
  for (const l of listeners) l(event);
}

/** Remove the serviceWorker property from navigator (restores jsdom default). */
function removeServiceWorker() {
  Reflect.deleteProperty(navigator, 'serviceWorker');
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  // Restore jsdom default where 'serviceWorker' is not defined on navigator
  removeServiceWorker();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ServiceWorkerRegistrar', () => {
  it('registers /sw.js on mount when navigator.serviceWorker is available', async () => {
    const { mockRegister } = installServiceWorker();

    await act(async () => {
      render(<ServiceWorkerRegistrar />);
    });

    expect(mockRegister).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('does NOT throw when navigator.serviceWorker is absent (SSR / unsupported browser)', async () => {
    // jsdom default: serviceWorker is not defined → 'serviceWorker' in navigator is false
    // afterEach ensures Reflect.deleteProperty has removed any prior install.
    // removeServiceWorker() here is belt-and-braces for when this test runs first.
    removeServiceWorker();

    await expect(
      act(async () => {
        render(<ServiceWorkerRegistrar />);
      })
    ).resolves.not.toThrow();
  });

  it('listens for REPLAY_GROCERY_ACTION messages after registration', async () => {
    const { messageListeners } = installServiceWorker();

    await act(async () => {
      render(<ServiceWorkerRegistrar />);
    });
    // Flush the .then() microtask so the message listener is registered
    await act(async () => { await Promise.resolve(); });

    expect(messageListeners.length).toBeGreaterThan(0);
  });

  it('ignores messages with unknown types', async () => {
    const { messageListeners } = installServiceWorker();

    await act(async () => { render(<ServiceWorkerRegistrar />); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireSwMessage(messageListeners, {
        type: 'UNKNOWN_TYPE',
        action: { kind: 'toggle', itemId: 'x' },
      });
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('handles REPLAY_GROCERY_ACTION kind="toggle" — reads localStorage and updates Supabase', async () => {
    const { messageListeners } = installServiceWorker();

    localStorage.setItem(
      'plately_grocery',
      JSON.stringify([{ id: 'item-1', checked: true }])
    );

    await act(async () => { render(<ServiceWorkerRegistrar />); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireSwMessage(messageListeners, {
        type: 'REPLAY_GROCERY_ACTION',
        action: { kind: 'toggle', itemId: 'item-1' },
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('grocery_items');
    expect(mockUpdate).toHaveBeenCalledWith({ checked: true });
    expect(mockEq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('handles REPLAY_GROCERY_ACTION kind="remove" — calls supabase.delete', async () => {
    const { messageListeners } = installServiceWorker();

    await act(async () => { render(<ServiceWorkerRegistrar />); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireSwMessage(messageListeners, {
        type: 'REPLAY_GROCERY_ACTION',
        action: { kind: 'remove', itemId: 'item-99' },
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('grocery_items');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'item-99');
  });

  it('handles REPLAY_GROCERY_ACTION with missing itemId gracefully (no crash)', async () => {
    const { messageListeners } = installServiceWorker();

    await act(async () => { render(<ServiceWorkerRegistrar />); });
    await act(async () => { await Promise.resolve(); });

    expect(() => {
      act(() => {
        fireSwMessage(messageListeners, {
          type: 'REPLAY_GROCERY_ACTION',
          action: { kind: 'toggle' }, // itemId absent
        });
      });
    }).not.toThrow();
  });

  it('calls registration.update() when document becomes visible', async () => {
    const { mockRegistration } = installServiceWorker();

    await act(async () => { render(<ServiceWorkerRegistrar />); });
    await act(async () => { await Promise.resolve(); });

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockRegistration.update).toHaveBeenCalled();
  });

  it('removes visibilitychange listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    installServiceWorker();

    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(<ServiceWorkerRegistrar />));
    });
    await act(async () => { await Promise.resolve(); });

    act(() => { unmount(); });

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('renders null (no visible output)', async () => {
    installServiceWorker();

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<ServiceWorkerRegistrar />));
    });

    expect(container.firstChild).toBeNull();
  });
});
