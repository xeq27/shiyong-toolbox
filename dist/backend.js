/**
 * 后端连通性检查模块：分别探测 Java 健康端点和数据库健康端点，不发送工具输入或本地内容。
 * @module
 */
/** 读取并校验健康端点状态，请求不携带工具输入或本地笔记。 */
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

/** 并行检查 Java 和数据库；Java 端点有有效响应与数据库状态为 UP 分别判断。 */
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
