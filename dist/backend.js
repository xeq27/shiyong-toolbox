/** Health requests contain no tool input or locally stored notes. */
async function readHealth(path, origin, timeoutMs) {
    const response = await fetch(origin ? new URL(path, origin) : path, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok && response.status !== 503) throw new Error('Health endpoint unavailable');
    const health = await response.json();
    if (!['UP', 'DOWN', 'OUT_OF_SERVICE', 'UNKNOWN'].includes(health.status)) {
        throw new Error('Invalid health response');
    }
    return health.status;
}

/** A responding Java process and an available database are different states. */
export async function checkBackendConnection({ origin = '', timeoutMs = 15000 } = {}) {
    const [javaHealth, databaseHealth] = await Promise.allSettled([
        readHealth('/actuator/health', origin, timeoutMs),
        readHealth('/actuator/health/database', origin, timeoutMs)
    ]);
    return {
        java: javaHealth.status === 'fulfilled',
        mysql: databaseHealth.status === 'fulfilled' && databaseHealth.value === 'UP'
    };
}
