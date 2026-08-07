import { actionOf, chunk, header, maskPair, safeName, wildcardPair } from './util.js';
import { formatIP } from '../lib/ipnet.js';

/* -------------------------------------------------------------------------- */
/* MikroTik RouterOS                                                           */
/* -------------------------------------------------------------------------- */

export const mikrotik = {
  id: 'mikrotik',
  name: 'MikroTik RouterOS (address-list)',
  vendor: 'MikroTik',
  category: 'router',
  extension: 'rsc',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://help.mikrotik.com/docs/display/ROS/Address-lists',
  notes:
    'Import with /import file-name=list.rsc, or paste into a terminal. Works on RouterOS v6 and v7. ' +
    'The script clears the previous entries of the same list first, so re-running it is safe.',
  notesFa:
    'با دستور /import file-name=list.rsc وارد کنید یا در ترمینال بچسبانید. روی RouterOS نسخه ۶ و ۷ کار می‌کند و اجرای دوباره آن امن است.',
  render(ctx) {
    const list = safeName(ctx.listName);
    const path = ctx.family === 6 ? '/ipv6 firewall address-list' : '/ip firewall address-list';
    const comment = `IPChek ${ctx.country} v${ctx.family}`;
    const lines = [header(ctx, '#'), '', path, `remove [find list="${list}"]`];
    for (const prefix of ctx.prefixes) {
      lines.push(`add list="${list}" address=${prefix} comment="${comment}"`);
    }
    lines.push(
      '',
      '# Example use — drop traffic from this list:',
      ctx.family === 6
        ? `# /ipv6 firewall filter add chain=forward src-address-list="${list}" action=drop`
        : `# /ip firewall filter add chain=forward src-address-list="${list}" action=drop`,
    );
    return lines.join('\n');
  },
};

export const mikrotikAutoUpdate = {
  id: 'mikrotik-autoupdate',
  name: 'MikroTik RouterOS (self-updating script)',
  vendor: 'MikroTik',
  category: 'router',
  extension: 'rsc',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://help.mikrotik.com/docs/display/ROS/Scheduler',
  notes:
    'Installs a scheduler entry that re-downloads the list from this IPChek server every day, so the router ' +
    'stays current without you touching it. Requires the router to reach this server.',
  notesFa:
    'یک زمان‌بند روی روتر می‌سازد که هر روز لیست را از همین سرور IPChek بگیرد؛ بنابراین روتر همیشه به‌روز می‌ماند.',
  render(ctx) {
    const list = safeName(ctx.listName);
    const url = ctx.selfUrl
      ? ctx.selfUrl.replace(/format=[^&]*/, 'format=mikrotik')
      : `http://IPCHEK-SERVER:8080/api/export/${ctx.country}?family=${ctx.family}&format=mikrotik`;
    const file = `ipchek-${list}.rsc`;
    const https = url.startsWith('https://');
    return [
      header(ctx, '#'),
      '',
      '# --- One-time installation: paste this whole block into the RouterOS terminal ---',
      '',
      https
        ? '# NOTE: RouterOS verifies TLS certificates. Import your CA under /certificate first,'
        : '# NOTE: this uses plain HTTP — keep the IPChek server on a trusted network,',
      https
        ? '#       or append check-certificate=no to the fetch command below if you accept the risk.'
        : '#       or serve IPChek over HTTPS and import the CA into /certificate.',
      '',
      `/system script remove [find name="ipchek-${list}"]`,
      `/system script add name="ipchek-${list}" policy=read,write,test,policy source={`,
      `    /tool fetch url="${url}" dst-path="${file}";`,
      '    :delay 5s;',
      `    /import file-name="${file}";`,
      `    :log info "IPChek: ${list} updated";`,
      '}',
      '',
      `/system scheduler remove [find name="ipchek-${list}"]`,
      `/system scheduler add name="ipchek-${list}" interval=1d start-time=03:15:00 \\`,
      `    on-event="/system script run ipchek-${list}" policy=read,write,test,policy`,
      '',
      '# Run it once now:',
      `/system script run ipchek-${list}`,
    ].join('\n');
  },
};

/* -------------------------------------------------------------------------- */
/* Fortinet FortiGate                                                          */
/* -------------------------------------------------------------------------- */

const FORTIGATE_GROUP_SIZE = 300;

export const fortigate = {
  id: 'fortigate',
  name: 'Fortinet FortiGate (address objects + group)',
  vendor: 'Fortinet',
  category: 'firewall',
  extension: 'conf',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://docs.fortinet.com/document/fortigate/latest/administration-guide/',
  notes:
    `Address objects are grouped in batches of ${FORTIGATE_GROUP_SIZE} because FortiOS limits members per group; ` +
    'the batches are collected into one parent group you can use in a policy. For lists of a few thousand ' +
    'entries prefer the Threat Feed format instead — it is far lighter on the device.',
  notesFa:
    `آبجکت‌های آدرس در دسته‌های ${FORTIGATE_GROUP_SIZE}تایی گروه‌بندی می‌شوند چون FortiOS برای اعضای هر گروه محدودیت دارد. ` +
    'برای لیست‌های چندهزارتایی بهتر است از قالب Threat Feed استفاده کنید.',
  render(ctx) {
    const base = safeName(ctx.listName);
    const v6 = ctx.family === 6;
    const addressTable = v6 ? 'firewall address6' : 'firewall address';
    const groupTable = v6 ? 'firewall addrgrp6' : 'firewall addrgrp';
    const lines = [header(ctx, '#'), '', `config ${addressTable}`];

    const names = ctx.prefixes.map((prefix, index) => {
      const name = `${base}_${String(index + 1).padStart(5, '0')}`;
      lines.push(`    edit "${name}"`);
      if (v6) {
        lines.push(`        set ip6 ${prefix}`);
      } else {
        lines.push('        set type ipmask', `        set subnet ${maskPair(ctx.nets[index])}`);
      }
      lines.push(`        set comment "IPChek ${ctx.country}"`, '    next');
      return name;
    });
    lines.push('end', '');

    const batches = chunk(names, FORTIGATE_GROUP_SIZE);
    lines.push(`config ${groupTable}`);
    batches.forEach((batch, index) => {
      const groupName = batches.length === 1 ? base : `${base}_g${index + 1}`;
      lines.push(`    edit "${groupName}"`, `        set member ${batch.map((n) => `"${n}"`).join(' ')}`, '    next');
    });
    if (batches.length > 1) {
      const parents = batches.map((_, index) => `"${base}_g${index + 1}"`).join(' ');
      lines.push(`    edit "${base}"`, `        set member ${parents}`, '    next');
    }
    lines.push('end');
    return lines.join('\n');
  },
};

export const fortigateThreatFeed = {
  id: 'fortigate-threatfeed',
  name: 'Fortinet FortiGate (Threat Feed / external resource)',
  vendor: 'Fortinet',
  category: 'firewall',
  extension: 'conf',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://docs.fortinet.com/document/fortigate/latest/administration-guide/891236/external-blocklist-policy',
  notes:
    'FortiOS 6.2+ downloads the list itself on a schedule and uses it directly in policy, which avoids creating ' +
    'thousands of address objects. This is the recommended way to consume large country lists on a FortiGate.',
  notesFa:
    'از FortiOS 6.2 به بعد، دستگاه خودش لیست را طبق زمان‌بندی دانلود می‌کند و نیازی به ساخت هزاران آبجکت نیست. ' +
    'برای لیست‌های بزرگ کشور، همین روش توصیه می‌شود.',
  render(ctx) {
    const name = safeName(ctx.listName);
    const url = ctx.selfUrl
      ? ctx.selfUrl.replace(/format=[^&]*/, 'format=plain')
      : `http://IPCHEK-SERVER:8080/api/export/${ctx.country}?family=${ctx.family}&format=plain`;
    return [
      header(ctx, '#'),
      '',
      'config system external-resource',
      `    edit "${name}"`,
      '        set type address',
      '        set category 192',
      `        set resource "${url}"`,
      '        set refresh-rate 60',
      '        set status enable',
      '    next',
      'end',
      '',
      '# Then reference it in a policy, for example:',
      '# config firewall policy',
      '#     edit 0',
      `#         set srcaddr "${name}"`,
      '#         set action deny',
      '#     next',
      '# end',
    ].join('\n');
  },
};

/* -------------------------------------------------------------------------- */
/* Cisco                                                                       */
/* -------------------------------------------------------------------------- */

export const ciscoAsa = {
  id: 'cisco-asa',
  name: 'Cisco ASA (object-group network)',
  vendor: 'Cisco',
  category: 'firewall',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://www.cisco.com/c/en/us/support/security/asa-firewall-services/',
  notes: 'Paste in configuration mode. Reference the group from an access-list with object-group.',
  notesFa: 'در حالت configuration بچسبانید و گروه را در access-list با object-group صدا بزنید.',
  render(ctx) {
    const name = safeName(ctx.listName);
    const lines = [header(ctx, '!'), '!', `object-group network ${name}`];
    for (const net of ctx.nets) {
      lines.push(net.version === 4 ? ` network-object ${maskPair(net)}` : ` network-object ${formatIP(6, net.base)}/${net.prefix}`);
    }
    lines.push(
      '!',
      `! access-list OUTSIDE_IN extended deny ip object-group ${name} any`,
    );
    return lines.join('\n');
  },
};

export const ciscoIos = {
  id: 'cisco-ios',
  name: 'Cisco IOS / IOS-XE (prefix-list)',
  vendor: 'Cisco',
  category: 'router',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://www.cisco.com/c/en/us/support/ios-nx-os-software/',
  notes: 'Sequence numbers step by 5 so you can insert entries later without renumbering.',
  notesFa: 'شماره‌های ترتیب با گام ۵ زیاد می‌شوند تا بعداً بتوانید بین آن‌ها ورودی اضافه کنید.',
  render(ctx) {
    const name = safeName(ctx.listName);
    const keyword = ctx.family === 6 ? 'ipv6 prefix-list' : 'ip prefix-list';
    const lines = [header(ctx, '!'), '!', `no ${keyword} ${name}`];
    ctx.prefixes.forEach((prefix, index) => {
      lines.push(`${keyword} ${name} seq ${(index + 1) * 5} permit ${prefix}`);
    });
    return lines.join('\n');
  },
};

export const ciscoIosAcl = {
  id: 'cisco-ios-acl',
  name: 'Cisco IOS (extended ACL)',
  vendor: 'Cisco',
  category: 'router',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html',
  notes: 'IPv4 entries use wildcard masks. Remember an implicit "deny any" ends every ACL.',
  notesFa: 'ورودی‌های IPv4 از wildcard mask استفاده می‌کنند. در انتهای هر ACL یک deny ضمنی وجود دارد.',
  render(ctx) {
    const name = safeName(ctx.listName);
    const verb = actionOf(ctx, { block: 'deny', allow: 'permit' });
    const lines = [header(ctx, '!'), '!'];
    if (ctx.family === 6) {
      lines.push(`no ipv6 access-list ${name}`, `ipv6 access-list ${name}`);
      for (const prefix of ctx.prefixes) lines.push(` ${verb} ipv6 ${prefix} any`);
      lines.push(' permit ipv6 any any');
    } else {
      lines.push(`no ip access-list extended ${name}`, `ip access-list extended ${name}`);
      for (const net of ctx.nets) {
        lines.push(` ${verb} ip ${wildcardPair(net)} any`);
      }
      lines.push(' permit ip any any');
    }
    return lines.join('\n');
  },
};

/* -------------------------------------------------------------------------- */
/* Juniper, Palo Alto, Huawei, VyOS, pfSense                                   */
/* -------------------------------------------------------------------------- */

export const juniper = {
  id: 'juniper',
  name: 'Juniper Junos (prefix-list)',
  vendor: 'Juniper',
  category: 'router',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://www.juniper.net/documentation/us/en/software/junos/routing-policy/',
  notes: 'Paste into configuration mode, then commit. Use the list in a firewall filter or routing policy.',
  notesFa: 'در حالت configuration بچسبانید و commit کنید؛ سپس در firewall filter یا routing policy استفاده کنید.',
  render(ctx) {
    const name = safeName(ctx.listName);
    const lines = [header(ctx, '#'), '', `delete policy-options prefix-list ${name}`];
    for (const prefix of ctx.prefixes) lines.push(`set policy-options prefix-list ${name} ${prefix}`);
    return lines.join('\n');
  },
};

export const paloalto = {
  id: 'paloalto',
  name: 'Palo Alto PAN-OS (set commands)',
  vendor: 'Palo Alto',
  category: 'firewall',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://docs.paloaltonetworks.com/pan-os',
  notes:
    'Paste in the CLI configure mode, then commit. For large lists prefer an External Dynamic List pointing at ' +
    'the plain-text URL of this server — PAN-OS refreshes those on its own.',
  notesFa:
    'در CLI و حالت configure بچسبانید و commit کنید. برای لیست‌های بزرگ بهتر است از External Dynamic List ' +
    'با آدرس متنی همین سرور استفاده کنید تا خود دستگاه به‌روزرسانی کند.',
  render(ctx) {
    const base = safeName(ctx.listName);
    const lines = [header(ctx, '#'), ''];
    const names = ctx.prefixes.map((prefix, index) => {
      const name = `${base}_${String(index + 1).padStart(5, '0')}`;
      lines.push(`set address ${name} ip-netmask ${prefix}`);
      lines.push(`set address ${name} description "IPChek ${ctx.country}"`);
      return name;
    });
    lines.push('');
    for (const batch of chunk(names, 200)) {
      lines.push(`set address-group ${base} static [ ${batch.join(' ')} ]`);
    }
    return lines.join('\n');
  },
};

export const huawei = {
  id: 'huawei',
  name: 'Huawei VRP (ip-prefix)',
  vendor: 'Huawei',
  category: 'router',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://support.huawei.com/enterprise/en/routers/',
  notes: 'Paste in system-view. Index numbers step by 10.',
  notesFa: 'در system-view بچسبانید. شماره ایندکس‌ها با گام ۱۰ افزایش می‌یابد.',
  render(ctx) {
    const name = safeName(ctx.listName);
    const lines = [header(ctx, '#'), ''];
    if (ctx.family === 6) {
      lines.push(`undo ip ipv6-prefix ${name}`);
      ctx.nets.forEach((net, index) => {
        lines.push(`ip ipv6-prefix ${name} index ${(index + 1) * 10} permit ${formatIP(6, net.base)} ${net.prefix}`);
      });
    } else {
      lines.push(`undo ip ip-prefix ${name}`);
      ctx.nets.forEach((net, index) => {
        lines.push(`ip ip-prefix ${name} index ${(index + 1) * 10} permit ${formatIP(4, net.base)} ${net.prefix}`);
      });
    }
    return lines.join('\n');
  },
};

export const vyos = {
  id: 'vyos',
  name: 'VyOS / EdgeOS (network group)',
  vendor: 'VyOS',
  category: 'router',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://docs.vyos.io/en/latest/configuration/firewall/groups.html',
  notes: 'Run in configure mode, then commit and save. EdgeOS uses the same firewall group syntax.',
  notesFa: 'در حالت configure اجرا کنید، سپس commit و save بزنید. EdgeOS هم همین دستورها را می‌پذیرد.',
  render(ctx) {
    const name = safeName(ctx.listName);
    const group = ctx.family === 6 ? 'ipv6-network-group' : 'network-group';
    const key = ctx.family === 6 ? 'ipv6-network' : 'network';
    const lines = [header(ctx, '#'), '', `delete firewall group ${group} ${name}`];
    lines.push(`set firewall group ${group} ${name} description "IPChek ${ctx.country} IPv${ctx.family}"`);
    for (const prefix of ctx.prefixes) lines.push(`set firewall group ${group} ${name} ${key} ${prefix}`);
    return lines.join('\n');
  },
};

export const pfsense = {
  id: 'pfsense',
  name: 'pfSense / OPNsense (URL table alias)',
  vendor: 'Netgate',
  category: 'firewall',
  extension: 'txt',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://docs.netgate.com/pfsense/en/latest/firewall/aliases.html',
  notes:
    'Create an alias of type "URL Table (IPs)" and point it at the live URL of this list with a 1-day refresh. ' +
    'pfSense and OPNsense then keep themselves updated. The file is a plain CIDR list, one per line.',
  notesFa:
    'یک Alias از نوع «URL Table (IPs)» بسازید و آدرس زنده همین لیست را با بازه یک‌روزه به آن بدهید تا ' +
    'pfSense یا OPNsense خودش به‌روزرسانی کند. خروجی یک لیست ساده CIDR است.',
  render(ctx) {
    return [header(ctx, '#'), ...ctx.prefixes].join('\n');
  },
};
