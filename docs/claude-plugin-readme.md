# Freehire

{{DESCRIPTION}}

Find technology roles by skills, salary, location and work mode. Compare employers
and market figures, build a shortlist, and keep your application stages on the
same tracking board you use at [freehire.me](https://freehire.me).

This plugin includes the `find-tech-jobs` skill and the remote Freehire MCP
connection at `https://freehire.me/api/v1/mcp`. Public search needs no account.
Connect your Freehire account with OAuth when you want personal tools, such as
saving jobs, reading your profile or updating application stages. Your host may
require you to start authentication from its connector settings.

Saving a job or changing a stage does not send an application to an employer.
Automatic applications require the account's **Let connected agents apply for
me** setting and your explicit request and approval before submission.

The skill reports unrecognized dictionary terms and failed operations with minimal
context. It excludes credentials, CV content and personal contact details, and
does not treat an empty search as a failure or a missing dictionary entry.

The plugin uses a hosted connection. It installs no local server or Node
dependencies and does not read a local credentials file.

[Setup and documentation](https://freehire.me/mcp) ·
[Privacy](https://freehire.me/privacy) ·
[Support and source](https://github.com/strelov1/freehire-mcp)
