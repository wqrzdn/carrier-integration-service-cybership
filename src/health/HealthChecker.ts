import { CircuitBreaker, CircuitState } from '../utils/circuitBreaker';
import { UpsAuthClient } from '../carriers/ups/UpsAuthClient';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail';
      message?: string;
      details?: Record<string, unknown>;
    };
  };
  uptime: number;
}

/*
 * this is the monitor for our service. it tells kubernetes or a load balancer 
 * if our app is ready to handle traffic. it does not just check if the 
 * server is on but actually verifies if we can get ups tokens and if 
 * the memory usage is safe.
 */
export class HealthChecker {
  private readonly startTime: number = Date.now();

  constructor(
    private readonly authClient: UpsAuthClient,
    private readonly circuitBreakers: Map<string, CircuitBreaker>
  ) {}

  async check(): Promise<HealthStatus> {
    const checks: HealthStatus['checks'] = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // check 1: oauth token - verifies we can still talk to ups
    try {
      const token = await this.authClient.getToken();
      checks.oauth = {
        status: token ? 'pass' : 'fail',
        message: token ? 'token acquired' : 'no token available',
      };
      if (!token) overallStatus = 'unhealthy';
    } catch (error) {
      checks.oauth = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'token acquisition failed',
      };
      overallStatus = 'unhealthy';
    }

    // check 2: circuit breakers - tells us if ups is currently down
    const openCircuits: string[] = [];
    this.circuitBreakers.forEach((breaker, name) => {
      if (breaker.getState() === CircuitState.OPEN) {
        openCircuits.push(name);
      }
    });

    checks.circuitBreakers = {
      status: openCircuits.length === this.circuitBreakers.size ? 'fail' : 'pass',
      message: openCircuits.length === 0 
        ? 'all circuits closed' 
        : `${openCircuits.length} circuits open: ${openCircuits.join(', ')}`,
      details: {
        total: this.circuitBreakers.size,
        open: openCircuits.length,
      },
    };

    if (openCircuits.length === this.circuitBreakers.size && this.circuitBreakers.size > 0) {
      overallStatus = 'unhealthy';
    } else if (openCircuits.length > 0) {
      overallStatus = 'degraded';
    }

    // check 3: memory usage - prevents the app from crashing silently
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    const memLimitMB = 500;

    checks.memory = {
      status: memUsageMB < memLimitMB ? 'pass' : 'fail',
      message: `heap usage: ${memUsageMB.toFixed(2)} mb`,
      details: {
        heapUsedMB: memUsageMB,
        limitMB: memLimitMB,
      },
    };

    if (memUsageMB >= memLimitMB) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      uptime: Date.now() - this.startTime,
    };
  }

  // liveness check for k8s to know if the process is stuck
  live(): HealthStatus {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        process: {
          status: 'pass',
          message: 'process is running',
        },
      },
      uptime: Date.now() - this.startTime,
    };
  }
}