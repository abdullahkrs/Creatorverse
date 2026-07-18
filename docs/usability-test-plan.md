# Creatorverse Five-User Usability Test Plan and Scorecard

**Task key:** `CV-MVP-002`  
**Target duration:** 10–15 minutes per participant  
**Primary viewport:** approximately `360 × 800`, portrait  
**Languages:** English (`LTR`) and Arabic (`RTL`)  
**Milestone decision:** at least **4 of 5** participants must independently explain Creatorverse and complete the creator-to-follower core loop without facilitator guidance.

## 1. Scope and evidence rule

This protocol tests whether a participant can understand and complete the current fictional Creatorverse loop:

1. Understand the purpose of a creator realm.
2. Enter or complete creator onboarding.
3. Identify the safe item or link intended for sharing.
4. Enter the intended realm as a follower.
5. Choose and explain a role.
6. Complete one short mission in under one minute.
7. Notice and explain the visible realm-energy change.
8. Explain why the result is worth sharing.

Use the same task order, scoring meanings, and debrief questions in both languages. A task is **unassisted** only when the facilitator does not identify, point to, describe, or otherwise reveal the target control. The only permitted recovery prompt appears in section 6. Any additional guidance makes the task **assisted**.

## 2. Privacy, consent, minors, and retention

Before starting, apply every safeguard below:

- Assign a random participant ID such as `P01`; do not record names, contacts, account handles, precise location, device identifiers, private social content, or unnecessary demographics.
- Participation is voluntary. The participant may skip any task or stop at any time without giving a reason.
- Do not record screen, audio, or video by default. Any future recording requires separate explicit informed consent and documented retention/deletion rules.
- Do not test with minors unless a separately approved guardian-consent and age-appropriate process exists.
- Never ask the participant to sign in to a real social account or expose passwords, tokens, secrets, contact lists, private messages, or follower data.
- Use only synthetic/public-safe fixtures and non-destructive error conditions. Never manipulate Production data.
- Keep every example inside the fictional Creatorverse universe. Do not introduce real politics, conflict, harassment, brigading, mass reporting, gambling-like rewards, pay-to-win, or off-platform actions.
- Keep only the minimum completed scorecard fields. Delete raw session notes after the five-session findings have been summarized and accepted; retain the anonymized summary only for milestone evidence.

## 3. Session setup

Prepare the session before the participant arrives:

- Open the approved test build or safe local fixture.
- Confirm the assigned language and expected document direction.
- Set the primary viewport to approximately `360 × 800` portrait.
- Use one-handed interaction where practical.
- Disable unrelated notifications and close unrelated tabs.
- Prepare a synthetic shared link or documented fixture that opens the intended fictional realm.
- Prepare one safe, non-destructive way to observe each required state: loading, empty content, invalid/expired link, recoverable mission failure, and network/service error.
- Prepare the blank scorecard in section 10.
- Do not pre-select the participant's role, reveal target controls, or explain the product before the neutral introduction.

### Dry-run checklist

- [ ] The test build opens without using Production data.
- [ ] The synthetic realm and shared-link fixture are available.
- [ ] Arabic displays as natural RTL and English as LTR.
- [ ] Switching language updates language/direction and preserves the current safe state.
- [ ] No primary action is clipped at the mobile viewport.
- [ ] Core actions do not depend on hover.
- [ ] Keyboard focus is visible and follows a logical order.
- [ ] Enter/Space activation works where applicable.
- [ ] Escape/back behavior is understandable where applicable.
- [ ] Status and errors are not communicated by color alone.
- [ ] Loading, empty, invalid-link, recoverable-failure, and network/service fixtures are safe and reversible.
- [ ] No real account, password, token, private content, or secret is required.
- [ ] The scorecard contains no fields for names, contacts, precise location, handles, or device IDs.

## 4. Neutral introduction

### English (`LTR`)

> Thank you for taking part. We are testing Creatorverse, not you. Participation is voluntary, and you may skip a task or stop at any time. We will use only the anonymous participant ID shown on the scorecard. We are not recording this session, and you will not be asked to sign in to a real social account or share private information. Please complete each task as you normally would and think aloud about what you expect.

### العربية (`RTL`)

<div dir="rtl">

> شكرًا لمشاركتك. نحن نختبر منتج «Creatorverse» وليس قدراتك. مشاركتك طوعية، ويمكنك تجاوز أي مهمة أو إيقاف الجلسة في أي وقت. سنستخدم فقط رمز المشارك المجهول الموضح في بطاقة التقييم. لن نسجل هذه الجلسة، ولن نطلب منك تسجيل الدخول إلى حساب تواصل اجتماعي حقيقي أو مشاركة معلومات خاصة. نفّذ كل مهمة كما تفعل عادة، وتحدث بصوت عالٍ عما تتوقع حدوثه.

</div>

## 5. Think-aloud instruction

### English (`LTR`)

> Complete the task as you normally would and think aloud about what you expect.

### العربية (`RTL`)

<div dir="rtl">

> نفّذ المهمة كما تفعل عادة، وتحدث بصوت عالٍ عما تتوقع حدوثه.

</div>

Do not confirm whether an action is correct while the participant is attempting a task. Neutral acknowledgements such as “Thank you” / “شكرًا” are allowed.

## 6. Permitted recovery prompt

Wait at least 10 seconds of inactivity before using the prompt once.

### English (`LTR`)

> What would you try next?

### العربية (`RTL`)

<div dir="rtl">

> ماذا تتوقع أن تفعل بعد ذلك؟

</div>

Never name, point to, or describe the target control. Any additional guidance makes the current task **pass assisted** at best.

## 7. Participant tasks

Read only the participant prompt. Record observable evidence; do not teach the interface.

### Task 1 — Explain the realm purpose

**English prompt:**  
> Look at this screen and explain what you believe Creatorverse lets a creator and followers do.

<div dir="rtl">

**المهمة 1 — شرح هدف العالم**

**النص العربي:**  
> انظر إلى هذه الشاشة واشرح ما الذي تعتقد أن «Creatorverse» يتيح للمبدع والمتابعين فعله.

</div>

**Pass unassisted:** The participant explains, in their own words, that a creator has a fictional digital realm and followers join it to complete short actions that visibly grow or change the realm.  
**Fail:** The participant describes a real-world political/conflict system, cannot identify a creator/follower relationship, or requires interpretation by the facilitator.

### Task 2 — Complete creator onboarding

**English prompt:**  
> Start the creator path and enter the realm as you normally would.

<div dir="rtl">

**المهمة 2 — إكمال تهيئة المبدع**

**النص العربي:**  
> ابدأ مسار المبدع وادخل إلى العالم كما تفعل عادة.

</div>

**Pass unassisted:** The participant reaches the creator realm without guidance, understands any fictional-world acknowledgement, and does not lose progress.  
**Fail:** A primary action is undiscoverable, clipped, inaccessible, or the participant cannot proceed safely.

### Task 3 — Identify what is safe to share

**English prompt:**  
> Show what you would send to a follower so they can join this realm. Do not open or sign in to a real social account.

<div dir="rtl">

**المهمة 3 — تحديد العنصر الآمن للمشاركة**

**النص العربي:**  
> وضّح ما الذي سترسله إلى متابع ليتمكن من الانضمام إلى هذا العالم. لا تفتح حساب تواصل اجتماعي حقيقي ولا تسجل الدخول إليه.

</div>

**Pass unassisted:** The participant identifies the intended synthetic/public-safe link or share item and understands that private account access is unnecessary.  
**Fail:** The flow requires credentials/private content, or the participant cannot determine what should be shared.

### Task 4 — Enter the intended realm as a follower

**English prompt:**  
> Use this provided test link and enter the realm as a follower.

<div dir="rtl">

**المهمة 4 — دخول العالم المقصود كمتابع**

**النص العربي:**  
> استخدم رابط الاختبار المقدم وادخل إلى العالم كمتابع.

</div>

**Pass unassisted:** The synthetic link opens the intended fictional realm and the participant recognizes that they are in the correct place.  
**Fail:** The link opens the wrong realm, produces a blank state, or requires facilitator interpretation.

### Task 5 — Choose and explain a role

**English prompt:**  
> Choose the role that fits how you would like to help this realm, then explain your choice.

<div dir="rtl">

**المهمة 5 — اختيار دور وشرحه**

**النص العربي:**  
> اختر الدور الذي يناسب الطريقة التي تود بها مساعدة هذا العالم، ثم اشرح سبب اختيارك.

</div>

**Pass unassisted:** The participant chooses a role and explains its expected purpose without guidance.  
**Fail:** Roles are indistinguishable, the meaning is misunderstood, or the choice cannot be completed accessibly.

### Task 6 — Complete one short mission

**English prompt:**  
> Complete one available mission as you normally would.

<div dir="rtl">

**المهمة 6 — إكمال مهمة قصيرة**

**النص العربي:**  
> أكمل إحدى المهام المتاحة كما تفعل عادة.

</div>

**Pass unassisted:** The participant completes the mission without guidance in under one minute and understands the goal, action, progress, and result.  
**Fail:** The participant cannot identify the goal/action, loses progress, or needs guidance.

### Task 7 — Find and explain the visible realm change

**English prompt:**  
> Show what changed in the realm after the mission and explain what it means.

<div dir="rtl">

**المهمة 7 — العثور على التغير الظاهر في العالم وشرحه**

**النص العربي:**  
> وضّح ما الذي تغير في العالم بعد المهمة، واشرح معنى هذا التغير.

</div>

**Pass unassisted:** The participant notices the realm-energy or equivalent visible change and accurately explains its relationship to the completed mission.  
**Fail:** The change is not visible, depends on color only, or cannot be explained.

### Task 8 — Explain the share value

**English prompt:**  
> Explain what result you would consider worth sharing and why.

<div dir="rtl">

**المهمة 8 — شرح قيمة المشاركة**

**النص العربي:**  
> اشرح النتيجة التي قد تراها جديرة بالمشاركة، ولماذا.

</div>

**Pass unassisted:** The participant identifies a fictional, safe result and can explain its value without proposing hostile, private, real-political, gambling-like, or pay-to-win behavior.  
**Fail:** No result is understandable or the only perceived value requires an unsafe/off-platform action.

### Task 9 — Switch language and verify direction

**English prompt:**  
> Switch the interface language, then continue from your current safe state and describe anything that became unclear.

<div dir="rtl">

**المهمة 9 — تبديل اللغة والتحقق من الاتجاه**

**النص العربي:**  
> بدّل لغة الواجهة، ثم واصل من حالتك الآمنة الحالية، واذكر أي شيء أصبح غير واضح.

</div>

**Pass unassisted:** Language and direction update together, the current safe state is preserved, text remains equivalent, numbers/icons remain understandable, and logos/media are not incorrectly mirrored.  
**Fail:** State is lost, direction is wrong, labels differ materially, or mixed-direction punctuation makes the flow unclear.

### Task 10 — Keyboard basics

**English prompt:**  
> Without using the pointer, move through the main controls and activate the next safe action.

<div dir="rtl">

**المهمة 10 — أساسيات استخدام لوحة المفاتيح**

**النص العربي:**  
> من دون استخدام المؤشر، تنقّل بين عناصر التحكم الرئيسية وفعّل الإجراء الآمن التالي.

</div>

**Pass unassisted:** Visible focus follows a logical order, accessible names are understandable, and the action works with keyboard input without focus loss.  
**Fail:** Focus disappears, order is illogical, a control lacks an understandable name, or pointer use is required.

## 8. Controlled state observations

Use documented fixtures or non-destructive conditions only. Do not manipulate Production data.

| State | Pass evidence | Fail evidence |
|---|---|---|
| Loading | Non-blank status explains that work is in progress. | Blank/frozen screen or no understandable status. |
| Empty content | Plain-language explanation and one clear safe next action. | Empty area with no explanation or recovery. |
| Invalid/expired link | Controlled message, no private data exposure, and one safe recovery action. | Crash, raw error, wrong realm, or credential request. |
| Recoverable mission failure | Explains what happened, preserves safe progress where possible, and offers one recovery action. | Progress is silently lost or the user is trapped. |
| Network/service error | Plain-language state and retry/back action; no secret or internal stack detail. | Blank state, secret/internal detail exposure, or destructive retry. |

<div dir="rtl">

| الحالة | دليل النجاح | دليل الفشل |
|---|---|---|
| التحميل | حالة غير فارغة توضح أن العملية قيد التنفيذ. | شاشة فارغة أو مجمدة من دون حالة مفهومة. |
| عدم توفر محتوى | شرح واضح وإجراء آمن واحد للمتابعة. | مساحة فارغة من دون شرح أو استعادة. |
| رابط غير صالح/منتهي | رسالة مضبوطة لا تكشف بيانات خاصة، مع إجراء آمن واحد للاستعادة. | تعطل أو خطأ خام أو عالم خاطئ أو طلب بيانات دخول. |
| فشل مهمة قابل للاستعادة | يوضح ما حدث ويحافظ على التقدم الآمن قدر الإمكان ويقدم إجراء استعادة واحدًا. | فقدان صامت للتقدم أو بقاء المستخدم عالقًا. |
| خطأ في الشبكة/الخدمة | رسالة واضحة مع إعادة المحاولة أو الرجوع، ومن دون أسرار أو تفاصيل داخلية. | حالة فارغة أو كشف أسرار/تفاصيل داخلية أو إعادة محاولة مدمرة. |

</div>

## 9. Debrief and closeout

Ask the same questions in the assigned language.

### English (`LTR`)

1. In one sentence, what is Creatorverse?
2. What was the first moment that felt unclear?
3. What did you expect to happen after completing the mission?
4. How confident are you that you could repeat the creator-to-follower loop without help? (`1` not confident – `5` very confident)
5. How likely are you to share a safe fictional result with a friend? (`1` very unlikely – `5` very likely)
6. What is the single most important improvement?

Close with:

> Thank you. The session is complete. Your anonymous scorecard will be used only to summarize product findings. Raw notes will be deleted after the five-session summary is accepted.

### العربية (`RTL`)

<div dir="rtl">

1. في جملة واحدة، ما هو «Creatorverse»؟
2. ما أول لحظة شعرت فيها بعدم الوضوح؟
3. ماذا توقعت أن يحدث بعد إكمال المهمة؟
4. ما مدى ثقتك بقدرتك على تكرار المسار من المبدع إلى المتابع من دون مساعدة؟ (`1` غير واثق – `5` واثق جدًا)
5. ما مدى احتمال مشاركتك نتيجة خيالية آمنة مع صديق؟ (`1` غير محتمل جدًا – `5` محتمل جدًا)
6. ما أهم تحسين واحد؟

نص الإغلاق:

> شكرًا لك. انتهت الجلسة. ستُستخدم بطاقة التقييم المجهولة فقط لتلخيص نتائج المنتج. وستُحذف الملاحظات الأولية بعد اعتماد ملخص الجلسات الخمس.

</div>

## 10. Per-participant scorecard

Do not enter names, contacts, precise locations, account handles, device IDs, private content, or unnecessary demographics.

### Session metadata

| Field | Allowed entry |
|---|---|
| Anonymous participant ID | `P01`–`P05` or another random code |
| Session language | `AR` / `EN` |
| Direction verified | `RTL` / `LTR` |
| Viewport/device class | Example: `~360×800 mobile portrait`; no device identifier |
| Date band | Optional broad date only; no precise location |
| Voluntary consent confirmed | `Yes` / `No` |
| No recording confirmed | `Yes` / `No` |
| Adult/approved process confirmed | `Adult` / `Separately approved process` |
| Raw-note deletion due | Date after five-session summary acceptance |

### Task evidence

Use only these outcomes: `Pass unassisted`, `Pass assisted`, or `Fail`.

| Task | Outcome | Duration band | First wrong turn | Critical friction | Participant explanation/evidence |
|---|---|---|---|---|---|
| 1. Explain realm purpose |  | `<30s` / `30–60s` / `>60s` |  |  |  |
| 2. Creator onboarding |  | `<30s` / `30–60s` / `>60s` |  |  |  |
| 3. Identify safe share item |  | `<30s` / `30–60s` / `>60s` |  |  |  |
| 4. Follower realm entry |  | `<30s` / `30–60s` / `>60s` |  |  |  |
| 5. Choose/explain role |  | `<30s` / `30–60s` / `>60s` |  |  |  |
| 6. Complete short mission |  | `<30s` / `30–60s` / `>60s` |  |  |  |
| 7. Explain realm-energy change |  | `<30s` / `30–60s` / `>60s` |  |  |  |
| 8. Explain share value |  | `<30s` / `30–60s` / `>60s` |  |  |  |
| 9. Language/direction switch |  | `<30s` / `30–60s` / `>60s` |  |  |  |
| 10. Keyboard basics |  | `<30s` / `30–60s` / `>60s` |  |  |  |

### Controlled states

| State | Outcome | Evidence / first friction |
|---|---|---|
| Loading | `Pass` / `Fail` / `Not observed` |  |
| Empty content | `Pass` / `Fail` / `Not observed` |  |
| Invalid/expired link | `Pass` / `Fail` / `Not observed` |  |
| Recoverable mission failure | `Pass` / `Fail` / `Not observed` |  |
| Network/service error | `Pass` / `Fail` / `Not observed` |  |

### Participant-level decision

| Measure | Entry |
|---|---|
| Explains Creatorverse independently | `Yes` / `No` |
| Completes creator-to-follower core loop unassisted | `Yes` / `No` |
| Participant milestone pass | `Yes` only when both rows above are `Yes` |
| Confidence | `1`–`5` |
| Safe fictional-result share intent | `1`–`5` |
| Highest-priority finding | One product finding only; exclude personal details |
| Contradiction to another observation | Short factual note or `None` |

## 11. Five-session summary

A milestone pass requires **at least 4 of 5** participant milestone passes. `Pass assisted` does not count as unassisted completion.

| Participant | Language | Explains Creatorverse independently | Completes core loop unassisted | Participant milestone pass | Confidence | Share intent | Highest-priority finding |
|---|---|---|---|---|---|---|---|
| P01 |  |  |  |  |  |  |  |
| P02 |  |  |  |  |  |  |  |
| P03 |  |  |  |  |  |  |  |
| P04 |  |  |  |  |  |  |  |
| P05 |  |  |  |  |  |  |  |

### Repeated friction and contradictions

| Finding | Participants affected | Languages affected | Repeated or contradictory evidence | Severity | Recommended next action |
|---|---|---|---|---|---|
|  |  |  |  | `Critical` / `High` / `Medium` / `Low` |  |
|  |  |  |  | `Critical` / `High` / `Medium` / `Low` |  |
|  |  |  |  | `Critical` / `High` / `Medium` / `Low` |  |

### Milestone decision

- Participant passes: `__/5`
- Required threshold: `4/5`
- Decision: `PASS` / `FAIL`
- Decision rule: mark `PASS` only when at least four participants independently explain Creatorverse **and** complete the creator-to-follower core loop unassisted.
- Do not mark the five-user validation complete until five real sessions have been conducted and summarized.
