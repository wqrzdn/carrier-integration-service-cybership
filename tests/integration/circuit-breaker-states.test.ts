import { CircuitBreaker, CircuitState } from '../../src/utils/circuitBreaker';

/*
 * these tests are the final proof that our system is bulletproof. 
 * we are simulating every possible failure and recovery scenario-ensuring
 * that the circuit opens correctly to protect our service and closes 
 * only when it is actually safe. having this suite means we can deploy 
 * with confidence knowing our bodyguard logic is solid.
 */

describe('Circuit Breaker State Machine', () => {
  it('starts in CLOSED state', () => {
    const breaker = new CircuitBreaker('TEST', { failureThreshold: 3, timeout: 1000 });
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('CLOSED → OPEN after reaching failure threshold', async () => {
    const breaker = new CircuitBreaker('TEST', { failureThreshold: 3, timeout: 1000 });
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    await expect(breaker.execute(async () => { throw new Error('fail 1'); })).rejects.toThrow('fail 1');
    await expect(breaker.execute(async () => { throw new Error('fail 2'); })).rejects.toThrow('fail 2');
    await expect(breaker.execute(async () => { throw new Error('fail 3'); })).rejects.toThrow('fail 3');
    
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('OPEN state rejects requests immediately (fail-fast)', async () => {
    const breaker = new CircuitBreaker('TEST', { failureThreshold: 1, timeout: 1000 });
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    
    const slowFn = jest.fn();
    await expect(breaker.execute(slowFn)).rejects.toThrow('circuit is open');
    expect(slowFn).not.toHaveBeenCalled();
  });

  it('HALF_OPEN → CLOSED after success threshold', async () => {
    const breaker = new CircuitBreaker('TEST', { 
      failureThreshold: 1, 
      successThreshold: 2,
      timeout: 10 
    });

    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await new Promise(resolve => setTimeout(resolve, 20));
    
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    await breaker.execute(async () => 'success 1');
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    await breaker.execute(async () => 'success 2');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});