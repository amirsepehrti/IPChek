import { actionOf, header, safeName } from './util.js';

export const nginxGeo = {
  id: 'nginx-geo',
  name: 'nginx (geo map variable)',
  vendor: 'nginx',
  category: 'server',
  extension: 'conf',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://nginx.org/en/docs/http/ngx_http_geo_module.html',
  notes:
    'Include inside the http block. The variable is 1 when the client is in this country, so you can branch on ' +
    'it for blocking, rate limiting or routing.',
  notesFa:
    'داخل بلوک http اضافه کنید. مقدار متغیر برای بازدیدکننده‌های این کشور برابر ۱ می‌شود و می‌توانید برای ' +
    'مسدودسازی، محدودسازی نرخ یا مسیریابی از آن استفاده کنید.',
  render(ctx) {
    const name = `$ipchek_${safeName(ctx.listName, { allowDash: false }).toLowerCase()}`;
    const lines = [header(ctx, '#'), '', `geo ${name} {`, '    default 0;'];
    for (const prefix of ctx.prefixes) lines.push(`    ${prefix} 1;`);
    lines.push('}', '', '# server {', `#     if (${name}) { return 403; }`, '# }');
    return lines.join('\n');
  },
};

export const nginxDeny = {
  id: 'nginx-deny',
  name: 'nginx (allow/deny include)',
  vendor: 'nginx',
  category: 'server',
  extension: 'conf',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://nginx.org/en/docs/http/ngx_http_access_module.html',
  notes: 'Include inside a server or location block: include /etc/nginx/ipchek.conf;',
  notesFa: 'داخل بلوک server یا location اضافه کنید: include /etc/nginx/ipchek.conf;',
  render(ctx) {
    const directive = actionOf(ctx, { block: 'deny', allow: 'allow' });
    const lines = [header(ctx, '#'), ''];
    for (const prefix of ctx.prefixes) lines.push(`${directive} ${prefix};`);
    if (ctx.options?.action === 'allow') lines.push('deny all;');
    return lines.join('\n');
  },
};

export const haproxy = {
  id: 'haproxy',
  name: 'HAProxy (ACL source file)',
  vendor: 'HAProxy',
  category: 'server',
  extension: 'lst',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://docs.haproxy.org/2.8/configuration.html#7.3.1',
  notes:
    'Save as /etc/haproxy/ipchek.lst and reference it with: acl from_country src -f /etc/haproxy/ipchek.lst',
  notesFa:
    'به‌عنوان /etc/haproxy/ipchek.lst ذخیره کنید و با این خط استفاده کنید: acl from_country src -f /etc/haproxy/ipchek.lst',
  render(ctx) {
    const action = actionOf(ctx, { block: 'http-request deny if from_country', allow: 'http-request allow if from_country' });
    return [header(ctx, '#'), ...ctx.prefixes, '', `# acl from_country src -f /etc/haproxy/ipchek.lst`, `# ${action}`].join('\n');
  },
};

export const apache = {
  id: 'apache',
  name: 'Apache httpd 2.4 (Require ip)',
  vendor: 'Apache',
  category: 'server',
  extension: 'conf',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://httpd.apache.org/docs/2.4/mod/mod_authz_core.html',
  notes: 'Include inside a <Directory>, <Location> or virtual host block.',
  notesFa: 'داخل بلوک <Directory>، <Location> یا virtual host اضافه کنید.',
  render(ctx) {
    const block = ctx.options?.action !== 'allow';
    const lines = [header(ctx, '#'), '', '<RequireAll>'];
    if (block) {
      lines.push('    Require all granted');
      for (const prefix of ctx.prefixes) lines.push(`    Require not ip ${prefix}`);
    } else {
      for (const prefix of ctx.prefixes) lines.push(`    Require ip ${prefix}`);
    }
    lines.push('</RequireAll>');
    return lines.join('\n');
  },
};

export const squid = {
  id: 'squid',
  name: 'Squid proxy (acl)',
  vendor: 'Squid',
  category: 'server',
  extension: 'conf',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'http://www.squid-cache.org/Doc/config/acl/',
  notes: 'Add to squid.conf above your other http_access lines, then reload Squid.',
  notesFa: 'در squid.conf بالای بقیه خطوط http_access اضافه کنید و Squid را reload کنید.',
  render(ctx) {
    const name = safeName(ctx.listName, { allowDash: false }).toLowerCase();
    const rule = actionOf(ctx, { block: `http_access deny ${name}`, allow: `http_access allow ${name}` });
    const lines = [header(ctx, '#'), ''];
    for (const prefix of ctx.prefixes) lines.push(`acl ${name} src ${prefix}`);
    lines.push('', rule);
    return lines.join('\n');
  },
};
