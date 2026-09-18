# Markdown properties

The guided editor exposes these fields without requiring YAML knowledge. Blank text inherits the template; `*-hide: true` hides a field. Repeated `{n}` keys use 1–999. Dates and declarations must come from your manuscript.

| Property | Type | Purpose | Requirement | Output | Help and example |
|---|---|---|---|---|---|
| `aaeu-schema` | integer | Property schema version | optional | First-page title and author area | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-template` | text | Journal template | optional | First-page title and author area | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-title` | text | Article title | required | First-page title and author area | Enter the information to print. The selected journal template supplies fonts, colors and placement. Thinking with AI |
| `aaeu-running-title` | text | Short running title | recommended | Running head and page number from page two | Enter the information to print. The selected journal template supplies fonts, colors and placement. AI and Learning |
| `aaeu-running-authors` | text | Running authors | optional | Running head and page number from page two | Enter the information to print. The selected journal template supplies fonts, colors and placement. Kim et al. |
| `aaeu-doi` | text | DOI | required | First-page publication information | Enter the information to print. The selected journal template supplies fonts, colors and placement. 10.1234/example.2026.001 |
| `aaeu-year` | text | Publication year | required | First-page publication information | Enter the information to print. The selected journal template supplies fonts, colors and placement. 2026 |
| `aaeu-volume` | text | Volume | optional | First-page publication information | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-issue` | text | Issue | optional | First-page publication information | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-received` | text | Received | required | Beside the abstract on page one | Enter the information to print. The selected journal template supplies fonts, colors and placement. September 1, 2026 |
| `aaeu-revised` | text | Revised | required | Beside the abstract on page one | Enter the information to print. The selected journal template supplies fonts, colors and placement. September 10, 2026 |
| `aaeu-accepted` | text | Accepted | required | Beside the abstract on page one | Enter the information to print. The selected journal template supplies fonts, colors and placement. September 18, 2026 |
| `aaeu-copyright-year` | text | Copyright year | optional | First-page publication information | Enter the information to print. The selected journal template supplies fonts, colors and placement. 2026 |
| `aaeu-first-page` | integer | First page | optional | First-page publication information | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-publication-mode` | mode | Publication status | optional | First-page publication information | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-abstract` | long | Abstract | required | First-page abstract panel | The abstract panel grows with its content. Use blank lines to separate paragraphs. Enter the purpose, methods and findings in one or more paragraphs. |
| `aaeu-keywords` | list | Keywords | recommended | First-page abstract panel | Enter the information to print. The selected journal template supplies fonts, colors and placement. AI, learning, writing |
| `aaeu-reference-checks` | boolean | Reference checks | optional | First-page title and author area | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-publication-text` | text | Publication information — text | optional | First-page upper left | Leave blank to use the template default. Custom text survives template changes. Variables such as {year} and {page} are supported.  |
| `aaeu-publication-hide` | boolean | Publication information — hide | optional | First-page upper left | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-copyright-text` | long | Copyright — text | optional | First-page footer | Leave blank to use the template default. Custom text survives template changes. Variables such as {year} and {page} are supported.  |
| `aaeu-copyright-hide` | boolean | Copyright — hide | optional | First-page footer | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-header-even-text` | text | Even-page running head — text | optional | Running head and page number from page two | Leave blank to use the template default. Custom text survives template changes. Variables such as {year} and {page} are supported. {journal} {year} |
| `aaeu-header-even-hide` | boolean | Even-page running head — hide | optional | Running head and page number from page two | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-header-odd-text` | text | Odd-page running head — text | optional | Running head and page number from page two | Leave blank to use the template default. Custom text survives template changes. Variables such as {year} and {page} are supported.  |
| `aaeu-header-odd-hide` | boolean | Odd-page running head — hide | optional | Running head and page number from page two | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-folio-text` | text | Page number — text | optional | Running head and page number from page two | Leave blank to use the template default. Custom text survives template changes. Variables such as {year} and {page} are supported. {page} |
| `aaeu-folio-hide` | boolean | Page number — hide | optional | Running head and page number from page two | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-sidebar-order` | list | Sidebar order | optional | Beside the abstract on page one | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-sidebar-received-hide` | boolean | Hide received | optional | Beside the abstract on page one | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-sidebar-revised-hide` | boolean | Hide revised | optional | Beside the abstract on page one | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-sidebar-accepted-hide` | boolean | Hide accepted | optional | Beside the abstract on page one | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-sidebar-correspondence-hide` | boolean | Hide correspondence | optional | Beside the abstract on page one | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-author-{n}-name` | text | Author {n} — name | recommended | First-page title and author area | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-author-{n}-affiliations` | list | Author {n} — affiliation numbers | optional | First-page title and author area | Enter the numbers of this author’s affiliations. Add the affiliations first.  |
| `aaeu-author-{n}-email` | text | Author {n} — email | optional | First-page title and author area | Enter the information to print. The selected journal template supplies fonts, colors and placement. name@example.org |
| `aaeu-author-{n}-address` | long | Author {n} — address | optional | First-page title and author area | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-author-{n}-corresponding` | boolean | Author {n} — corresponding author | optional | First-page title and author area | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-affiliation-{n}-text` | long | Affiliation {n} — text | recommended | First-page title and author area | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-corresponding-name` | text | Corresponding author name | required | Beside the abstract on page one | Enter the information to print. The selected journal template supplies fonts, colors and placement. Min Kim |
| `aaeu-corresponding-email` | text | Corresponding author email | required | Beside the abstract on page one | Enter the information to print. The selected journal template supplies fonts, colors and placement. editor@example.org |
| `aaeu-corresponding-address` | long | Corresponding author affiliation and address | optional | Beside the abstract on page one | Enter the information to print. The selected journal template supplies fonts, colors and placement. Department, University, City, Country |
| `aaeu-sidebar-{n}-label` | text | Custom information {n} — label | optional | Beside the abstract on page one | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-sidebar-{n}-text` | long | Custom information {n} — text | optional | Beside the abstract on page one | Enter the information to print. The selected journal template supplies fonts, colors and placement.  |
| `aaeu-sidebar-{n}-hide` | boolean | Custom information {n} — hide | optional | Beside the abstract on page one | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-data-text` | long | Data availability statement — text | required | Immediately before References | Enter the statement appropriate to your manuscript. The editor does not invent declarations.  |
| `aaeu-data-hide` | boolean | Data availability statement — hide | optional | Immediately before References | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-data-omission-reason` | text | Data availability statement — reason for omission | optional | Immediately before References | Record why required journal information was omitted. This reason is not printed.  |
| `aaeu-funding-text` | long | Funding information — text | required | Immediately before References | Enter the statement appropriate to your manuscript. The editor does not invent declarations.  |
| `aaeu-funding-hide` | boolean | Funding information — hide | optional | Immediately before References | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-funding-omission-reason` | text | Funding information — reason for omission | optional | Immediately before References | Record why required journal information was omitted. This reason is not printed.  |
| `aaeu-conflict-text` | long | Conflict of interest — text | required | Immediately before References | Enter the statement appropriate to your manuscript. The editor does not invent declarations.  |
| `aaeu-conflict-hide` | boolean | Conflict of interest — hide | optional | Immediately before References | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-conflict-omission-reason` | text | Conflict of interest — reason for omission | optional | Immediately before References | Record why required journal information was omitted. This reason is not printed.  |
| `aaeu-acknowledgments-text` | long | Acknowledgments — text | optional | Immediately before References | Enter the statement appropriate to your manuscript. The editor does not invent declarations.  |
| `aaeu-acknowledgments-hide` | boolean | Acknowledgments — hide | optional | Immediately before References | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-acknowledgments-omission-reason` | text | Acknowledgments — reason for omission | optional | Immediately before References | Record why required journal information was omitted. This reason is not printed.  |
| `aaeu-ethics-text` | long | Ethics statement — text | optional | Immediately before References | Enter the statement appropriate to your manuscript. The editor does not invent declarations.  |
| `aaeu-ethics-hide` | boolean | Ethics statement — hide | optional | Immediately before References | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-ethics-omission-reason` | text | Ethics statement — reason for omission | optional | Immediately before References | Record why required journal information was omitted. This reason is not printed.  |
| `aaeu-contributions-text` | long | Author contributions — text | optional | Immediately before References | Enter the statement appropriate to your manuscript. The editor does not invent declarations.  |
| `aaeu-contributions-hide` | boolean | Author contributions — hide | optional | Immediately before References | Hide both the information and its label in the output. Entered values are retained.  |
| `aaeu-contributions-omission-reason` | text | Author contributions — reason for omission | optional | Immediately before References | Record why required journal information was omitted. This reason is not printed.  |
| `aaeu-statement-{n}-title` | text | Additional statement {n} — title | optional | Immediately before References | Enter the statement appropriate to your manuscript. The editor does not invent declarations.  |
| `aaeu-statement-{n}-text` | long | Additional statement {n} — text | optional | Immediately before References | Enter the statement appropriate to your manuscript. The editor does not invent declarations.  |
| `aaeu-statement-{n}-hide` | boolean | Additional statement {n} — hide | optional | Immediately before References | Hide both the information and its label in the output. Entered values are retained.  |
