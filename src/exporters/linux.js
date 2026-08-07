import { actionOf, chunk, header, safeName } from './util.js';

export const iptables = {
  id: 'iptables',
  name: 'iptables / ip6tables (shell script)',
  vendor: 'Linux',
  category: 'linux',
  extension: 'sh',
  mime: 'text/x-shellscript',
  families: [4, 6],
  docs: 'https://netfilter.org/documentation/',
  notes:
    'Creates a dedicated chain so the rules can be flushed and rebuilt without touching your other rules. ' +
    'One linear rule per prefix gets slow past a few hundred entries — use the ipset format for large lists.',
  notesFa:
    'یک chain اختصاصی می‌سازد تا بدون دست‌زدن به بقیه قوانین قابل بازسازی باشد. برای لیست‌های بزرگ ' +
    'از قالب ipset استفاده کنید چون قوانین خطی iptables کند می‌شوند.',
  render(ctx) {
    const chain = safeName(ctx.listName, { allowDash: false }).toUpperCase();
    const binary = ctx.family === 6 ? 'ip6tables' : 'iptables';
    const target = actionOf(ctx, { block: 'DROP', allow: 'ACCEPT' });
    const lines = [
      '#!/bin/sh',
      header(ctx, '#'),
      'set -e',
      '',
      `${binary} -N ${chain} 2>/dev/null || ${binary} -F ${chain}`,
    ];
    for (const prefix of ctx.prefixes) lines.push(`${binary} -A ${chain} -s ${prefix} -j ${target}`);
    lines.push(
      '',
      '# Hook the chain into INPUT (run once):',
      `# ${binary} -C INPUT -j ${chain} 2>/dev/null || ${binary} -I INPUT 1 -j ${chain}`,
    );
    return lines.join('\n');
  },
};

export const ipset = {
  id: 'ipset',
  name: 'ipset (restore file)',
  vendor: 'Linux',
  category: 'linux',
  extension: 'ipset',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://ipset.netfilter.org/ipset.man.html',
  notes:
    'Load with: ipset restore -f list.ipset — matching stays O(1) no matter how many prefixes there are. ' +
    'Then point one iptables rule at the set.',
  notesFa:
    'با دستور ipset restore -f list.ipset بارگذاری کنید. سرعت تطبیق مستقل از تعداد پیشوندها ثابت می‌ماند ' +
    'و فقط به یک قانون iptables نیاز دارید.',
  render(ctx) {
    const name = safeName(ctx.listName);
    const family = ctx.family === 6 ? 'inet6' : 'inet';
    // hashsize must be a power of two and comfortably above the entry count.
    const hashsize = Math.min(1048576, Math.max(1024, 2 ** Math.ceil(Math.log2(Math.max(ctx.prefixes.length, 1)))));
    const maxelem = Math.max(65536, ctx.prefixes.length * 2);
    const binary = ctx.family === 6 ? 'ip6tables' : 'iptables';
    const target = actionOf(ctx, { block: 'DROP', allow: 'ACCEPT' });
    const lines = [
      header(ctx, '#'),
      `create ${name} hash:net family ${family} hashsize ${hashsize} maxelem ${maxelem} comment -exist`,
      `flush ${name}`,
    ];
    for (const prefix of ctx.prefixes) lines.push(`add ${name} ${prefix}`);
    lines.push('', `# ${binary} -I INPUT -m set --match-set ${name} src -j ${target}`);
    return lines.join('\n');
  },
};

export const nftables = {
  id: 'nftables',
  name: 'nftables (named set)',
  vendor: 'Linux',
  category: 'linux',
  extension: 'nft',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://wiki.nftables.org/wiki-nftables/index.php/Sets',
  notes:
    'Load with: nft -f list.nft — the interval set is stored as a tree, so lookups stay fast. ' +
    'The file replaces only its own table, leaving the rest of your ruleset alone.',
  notesFa:
    'با دستور nft -f list.nft بارگذاری می‌شود. ست از نوع interval است و جست‌وجو سریع می‌ماند؛ ' +
    'فقط جدول مربوط به خودش را جایگزین می‌کند.',
  render(ctx) {
    const setName = safeName(ctx.listName, { allowDash: false });
    const table = `ipchek_${ctx.family === 6 ? 'v6' : 'v4'}`;
    const type = ctx.family === 6 ? 'ipv6_addr' : 'ipv4_addr';
    const saddr = ctx.family === 6 ? 'ip6 saddr' : 'ip saddr';
    const verdict = actionOf(ctx, { block: 'drop', allow: 'accept' });
    const elements = ctx.prefixes.length ? `        elements = { ${ctx.prefixes.join(', ')} }` : '        # empty';
    return [
      header(ctx, '#'),
      '',
      `table inet ${table} {`,
      `    set ${setName} {`,
      `        type ${type}`,
      '        flags interval',
      '        auto-merge',
      elements,
      '    }',
      '',
      '    chain input {',
      '        type filter hook input priority filter; policy accept;',
      `        ${saddr} @${setName} counter ${verdict}`,
      '    }',
      '}',
    ].join('\n');
  },
};

export const windowsNetsh = {
  id: 'windows-netsh',
  name: 'Windows Firewall (netsh)',
  vendor: 'Microsoft',
  category: 'windows',
  extension: 'bat',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://learn.microsoft.com/windows-server/networking/technologies/netsh/netsh-advfirewall-firewall',
  notes:
    'Run as Administrator. Prefixes are split across several rules because netsh caps the length of the ' +
    'remoteip argument.',
  notesFa:
    'با دسترسی Administrator اجرا کنید. چون netsh برای طول آرگومان remoteip محدودیت دارد، ' +
    'پیشوندها بین چند قانون تقسیم می‌شوند.',
  render(ctx) {
    const base = safeName(ctx.listName);
    const action = actionOf(ctx, { block: 'block', allow: 'allow' });
    const lines = ['@echo off', header(ctx, 'REM'), ''];
    const batches = chunk(ctx.prefixes, 200);
    batches.forEach((batch, index) => {
      const name = `IPChek ${base} ${index + 1}`;
      lines.push(`netsh advfirewall firewall delete rule name="${name}" >nul 2>&1`);
      lines.push(
        `netsh advfirewall firewall add rule name="${name}" dir=in action=${action} remoteip=${batch.join(',')}`,
      );
    });
    lines.push('', 'echo IPChek rules applied.');
    return lines.join('\n');
  },
};

export const powershell = {
  id: 'powershell',
  name: 'Windows Firewall (PowerShell)',
  vendor: 'Microsoft',
  category: 'windows',
  extension: 'ps1',
  mime: 'text/plain',
  families: [4, 6],
  docs: 'https://learn.microsoft.com/powershell/module/netsecurity/new-netfirewallrule',
  notes: 'Run in an elevated PowerShell. Removes the previous rule of the same name before adding it again.',
  notesFa: 'در PowerShell با دسترسی مدیر اجرا کنید. قانون قبلی با همین نام حذف و دوباره ساخته می‌شود.',
  render(ctx) {
    const name = `IPChek-${safeName(ctx.listName)}`;
    const action = actionOf(ctx, { block: 'Block', allow: 'Allow' });
    const list = ctx.prefixes.map((prefix) => `    '${prefix}'`).join(',\n');
    return [
      header(ctx, '#'),
      '',
      '$prefixes = @(',
      list,
      ')',
      '',
      `Get-NetFirewallRule -DisplayName '${name}' -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
      `New-NetFirewallRule -DisplayName '${name}' -Direction Inbound -Action ${action} \``,
      '    -RemoteAddress $prefixes -Profile Any | Out-Null',
      `Write-Host "IPChek: $($prefixes.Count) prefixes applied to rule ${name}"`,
    ].join('\n');
  },
};
