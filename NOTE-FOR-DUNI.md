# Note for Duni

Hi Duni! I put together an independent, fully English Discord bot for the two server improvements we discussed:

- Automatic removal of Discord invite links outside approved channels, with configurable exemptions for `#clan-ads`, voice-channel text chats, and optional staff roles.
- Temporary voice channels with a Join to Create lobby and nine owner controls (privacy, user limits, delete, block/unblock, trust/untrust, kick and ownership transfer).

All settings can be managed through slash commands, and nothing relies on my personal Discord servers, tokens or database. Your bot credentials stay under your control. You can review, host and modify the source code however you like.

The README contains setup and hosting instructions. The main commands are `/invites`, `/setup-voice`, and `/voice`. Invite filtering starts off for safety, so please select `#clan-ads` as an allowed channel before enabling it.

I ran syntax checks and unit tests. I couldn't test this build in your live Discord server, so please test it in a private channel/server first and check the permissions before enabling the filter everywhere.
