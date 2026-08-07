const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

const COLORS = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

const threshold = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function emit(level, scope, args) {
  if (LEVELS[level] < threshold) return;
  const time = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const label = level.toUpperCase().padEnd(5);
  const prefix = useColor
    ? `\x1b[90m${time}${RESET} ${COLORS[level]}${label}${RESET} \x1b[35m${scope}${RESET}`
    : `${time} ${label} ${scope}`;
  const stream = LEVELS[level] >= LEVELS.warn ? console.error : console.log;
  stream(prefix, ...args);
}

export function createLogger(scope) {
  return {
    debug: (...args) => emit('debug', scope, args),
    info: (...args) => emit('info', scope, args),
    warn: (...args) => emit('warn', scope, args),
    error: (...args) => emit('error', scope, args),
  };
}

export default createLogger('ipchek');
