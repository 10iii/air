# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in AIR, please report it by:

1. **Do NOT** open a public issue
2. Email security concerns to: [security@10iii.dev] (or open a private security advisory on GitHub)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- Initial response: Within 48 hours
- Assessment: Within 1 week
- Fix timeline: Depends on severity

## Security Considerations

### Data Handling
- AIR processes file contents and command outputs locally
- The MCP server runs locally via stdio transport
- No data is sent to external servers except:
  - Anonymous telemetry (can be disabled)
  - AIR Facts API (crowdsourced statistics, no PII)

### Telemetry
- Collects: content hashes, compression ratios, command types
- Does NOT collect: actual file contents, paths, or personal data
- Disable via: `air config --telemetry=off`

### Dependencies
- Minimal runtime dependencies
- Regular dependency audits via `npm audit`
