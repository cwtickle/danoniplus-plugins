# danoniplus-plugins

A collection of custom JS and skins for [Dancing☆Onigiri (CW Edition)](https://github.com/cwtickle/danoniplus).

日本語: [README.md](./README.md)

## Custom JS list

Each custom JS lives in its own folder named after its purpose. See the "Wiki" link in the list for setup instructions and options.

<!-- The table below is updated automatically. Do not edit inside the CUSTOM-JS-LIST markers by hand. -->
<!-- CUSTOM-JS-LIST:START -->
| Name | Type | Summary | Supported versions | Author | Last updated | Details |
|---|---|---|---|---|---|---|
<!-- CUSTOM-JS-LIST:END -->

## Folder structure

```
<name>/          … one folder per purpose (also used as the wiki page name)
  js/            … custom JS
  skin/          … CSS / JS for skins
```

## How to add or update (Pull Request)

1. Create a folder named after the purpose, and put `js/` or `skin/` inside it with your files.
2. Use one of these PR title formats. The folder name is detected from the changed files, so you don't need to put it in the title.
   - New: `add: description`
   - Update: `update: description` / `fix: description` / `refactor: description`, etc. (anything other than `add:` and `chore:`; see the notes below for `chore:`)
3. For an `add:` PR, fill in the PR template headings (Overview / Supported Versions / Installation / Configuration / Notes / Screenshots, each written bilingually — keep the headings as they are). When merged, the wiki page and this list are created automatically.
4. For an update PR, the PR title is appended to the page's update history in the wiki, and the "Last updated" column here is refreshed.

Notes:

- A single PR can change only one purpose folder.
- `remove:` (deletion) is not supported yet.
- `chore:` PRs and Dependabot PRs are skipped: no validation and no wiki / README update (even if they touch a purpose folder).
