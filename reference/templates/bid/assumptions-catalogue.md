# Assumptions and exclusions catalogue — template

These are standard wordings for the bid's assumptions register (`bid-registers-template.md` §11).

## How to use them

1. **Choose and fill in.** Pick only the assumptions that apply. Replace every `N` and `<…>` with the bid's own value, and give each assumption the bid's own ID.
2. **Check against the RFP.**
   - An assumption must never contradict a promise elsewhere in the bid.
   - An assumption must never set aside an RFP condition. That is a deviation, and it is declared where the RFP asks.
3. **Check against the bid's own rules.**
   - Where the RFP makes the bidder own something (for example testing), an assumption cannot hand it to the customer.
   - In a fixed-price offer, avoid time-and-materials wording (billing units, "re-estimate later").
4. **Define each cap once.** Every cap ("up to N") is defined once and referenced everywhere. The estimate rows carry the same caps.
5. **Name an owner.** Every customer dependency names the customer role that owns it.

## A. Commercial and contractual

| ID | Wording | Note |
|---|---|---|
| COM-01 | This offer is budgetary and non-binding until a signed agreement or purchase order exists. | Budgetary and proactive offers only. Do not use in a binding RFP response. |
| COM-02 | The price is a fixed price for the scope, deliverables and caps stated in this offer. | Fixed price. No billing units in the same section. |
| COM-03 | Services are provided on a time-and-materials basis; estimates are provisional and actual effort is invoiced monthly. | Time and materials. |
| COM-04 | Effort is capped at N person-days. The bidder notifies the customer at 80% consumption; further effort needs an additional purchase order. | Spend control under time and materials. |
| COM-05 | Anything not explicitly described as in scope is out of scope and handled through change control. | Always. |
| COM-06 | Prices are in `<currency>`, exclude VAT and other taxes, and are valid for N days from the date of this offer. | Always state validity. |
| COM-07 | Travel and accommodation are excluded and invoiced at cost under the bidder's travel policy, after the customer's prior approval. | Or include a travel budget. Keep the wording the same as the price total. |
| COM-08 | Contingency of N% is included for the risks listed in the risk register and is reported monthly. | Fixed price. Disclose it or not as a deliberate choice. |
| COM-09 | Payment follows the milestone schedule. The final N% is due on acceptance of the closure deliverables. | Gate-based pricing with retention. |
| COM-10 | Licences and subscriptions are not part of this offer. The customer holds or procures the subscriptions listed in the licence position. | See the licence position. |

## B. Timeline, staffing and working model

| ID | Wording |
|---|---|
| TIM-01 | The plan assumes a start on `<date>` and decisions on design questions within N working days. Delays caused by late decisions are handled through change control. |
| TIM-02 | The schedule is confirmed at signature and depends on both parties' resource availability. The staffing lead time is N weeks after the purchase order. |
| TIM-03 | Delivery is remote from the bidder's delivery centres, with on-site presence for `<named workshops / go-live>`. |
| TIM-04 | The working week is 40 hours in `<time zone>`. Project language is English. |
| TIM-05 | Holiday periods (`<period>`) reduce workshop and test capacity. The plan accounts for them; further unavailability is handled through change control. |
| TIM-06 | Named consultants may be replaced by consultants of equivalent profile with N weeks' notice; the replacement's ramp-up is at the bidder's cost. |

## C. Customer responsibilities

| ID | Wording |
|---|---|
| CUS-01 | The customer names a sponsor, a product owner with decision authority, and process owners before kick-off. They are available as stated in the customer-roles table. |
| CUS-02 | The customer provides access, accounts and VPN to the instances within N working days of kick-off. |
| CUS-03 | The customer provides subject-matter experts for workshops, reviews and testing, as planned. |
| CUS-04 | The customer executes user acceptance testing within N working days per release and signs it off. The bidder writes the scenarios and supports execution. |
| CUS-05 | The customer coordinates its third parties (system owners, vendors, other contractors) and their availability for integration and testing. |
| CUS-06 | The customer owns organisational change management and internal communication, unless the offer includes them. |
| CUS-07 | Sign-off windows: documents and test results not rejected within N working days of submission are deemed accepted. |

## D. Platform, release and licences

| ID | Wording |
|---|---|
| PLT-01 | The solution is built on the `<release family>` release. A platform upgrade during the project is out of scope unless stated. |
| PLT-02 | The customer provides development, test and production instances, and activates the plugins and Store applications named in the licence position. |
| PLT-03 | Capabilities that need a higher product tier, an add-on or a Store application are marked as such in the solution. They are delivered only if the customer holds that entitlement. |
| PLT-04 | AI capabilities depend on the AI entitlement named in the licence position. Their usage counts against the customer's AI consumption allowance. |
| PLT-05 | Product defects are raised with the platform vendor's support. The bidder is not liable for the vendor's product or for third-party systems. |
| PLT-06 | The solution uses out-of-the-box processes, data model, roles and access controls. Customisation is limited to what this offer lists. |

## E. Scope caps (configuration)

| ID | Wording |
|---|---|
| CAP-01 | Up to N design workshops of N hours per topic, for the topics listed. |
| CAP-02 | Up to N case types / catalogue items / record producers, each with up to N variables. |
| CAP-03 | Up to N notifications, N SLA definitions, N reports and N dashboards. |
| CAP-04 | One portal using standard widgets. Branding is limited to colours, logo, title and background. |
| CAP-05 | The user interface is in English. Additional languages use the platform's language packs; translating the customer's content is the customer's task. |
| CAP-06 | Referenced modules (for example contracts, assets, product models) are used as they are, with no configuration in this offer. |
| CAP-07 | Up to N AI use cases, as listed. Each has a human review step, and its output quality depends on the customer's data and knowledge content. |

## F. Data and migration

| ID | Wording |
|---|---|
| DAT-01 | No migration of historical records from legacy systems. |
| DAT-02 | The customer provides master and reference data in the bidder's templates, complete and cleansed. The bidder loads it in up to N load cycles (trial and final). |
| DAT-03 | Migration covers `<scope>`, from up to N sources, with a history window of N months. Records are reconciled with an exception log. |
| DAT-04 | The bidder owns the quality of the data it integrates. The source owner owns remediation of existing data. |

## G. Integrations

| ID | Wording |
|---|---|
| INT-01 | An integration is one data exchange between the platform and one external system in one direction, using a standard method (spoke, REST, file). The integrations in scope are listed with direction and method. |
| INT-02 | The external systems provide documented APIs and test environments before build starts. |
| INT-03 | Changes in external systems and in middleware are the customer's or the third party's responsibility. |
| INT-04 | Integrations that need a licensed integration capability (for example IntegrationHub spokes) assume that entitlement. |
| INT-05 | Volumes are up to N transactions per day; higher volumes need a performance review. |

## H. Testing and quality

| ID | Wording |
|---|---|
| TST-01 | The bidder performs unit and system integration testing of the delivered scope. |
| TST-02 | Automated regression tests (ATF) cover up to N critical flows per release. |
| TST-03 | Performance, load and penetration testing are out of scope unless listed. |
| TST-04 | The customer runs regression testing of processes outside the delivered scope. |
| TST-05 | Defects are classified as critical, high, medium or low. Go-live requires zero critical and zero high defects. |

## I. Training, knowledge transfer and change

| ID | Wording |
|---|---|
| TRN-01 | Train-the-trainer: N recorded sessions of N hours per audience (fulfillers, administrators), with a training guide. End-user training is delivered by the customer's trainers. |
| TRN-02 | Knowledge transfer is through design documents, stories, update sets and N handover sessions. |
| TRN-03 | Organisational change management activities are limited to `<list>`. |

## J. Go-live, hypercare and warranty

| ID | Wording |
|---|---|
| GOL-01 | Hypercare lasts N weeks after each go-live and covers defects in the delivered scope during business hours. |
| GOL-02 | Warranty: the bidder corrects defects against the accepted design that are reported within N days of go-live. Changes, misuse and third-party causes are excluded. |
| GOL-03 | After hypercare, support moves to the customer's support organisation or to a separate support contract. |
| GOL-04 | The bidder prepares deployment packages and a release runbook. `<The bidder / the customer>` deploys to production. |

## K. Security and compliance

| ID | Wording |
|---|---|
| SEC-01 | Access uses the platform's out-of-the-box roles and access controls. Data segregation beyond that, such as domain separation, is out of scope unless listed. |
| SEC-02 | The customer provides its security, data-protection and development guidelines at kick-off; changes to them after design are handled through change control. |
| SEC-03 | Personal data is processed within `<region>`. A data processing agreement is signed where the customer requires it. |

## Standard exclusions

These are excluded unless the offer lists them:
- legacy data migration and data cleansing;
- custom user-interface pages and widgets;
- custom tables and scoped applications;
- domain separation;
- integrations not listed;
- performance testing;
- translation of content;
- end-user training;
- organisational change management;
- platform upgrades;
- managed services after hypercare;
- licences;
- travel.
