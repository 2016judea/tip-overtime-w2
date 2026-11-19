#!/usr/bin/env python3
"""Build the ChatGPT plugin package (Agent Plugins format) for the connector: chatgpt-plugin/plugin.json,
mcp.json and assets/ -> chatgpt-plugin.zip. Pattern: small-business-intelligence-mcp/SUBMISSION-KIT.md
§10 (the portal takes only a ZIP since 2026-10-09; no pricing words in metadata; every hint explicit;
any change to the tool surface = rescan + new version). Test cases are the ones in SUBMISSION.md."""
import json, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PKG = ROOT / "chatgpt-plugin"
SITE = "https://tip-overtime-w2.vercel.app"
DESC = ("Works out the federal no-tax-on-tips and no-tax-on-overtime deductions (Schedule 1-A, Form 1040, tax years 2025-2028) "
        "and the new 2026 W-2 boxes, in code, with every Schedule 1-A line shown and a citation to the statute, regulation, "
        "IRS form or notice behind each rule. A worker gives what is on their W-2 (box 12 codes TP and TT, box 14b) or their pay "
        "stubs, filing status and income, and gets both deductions, the Form 1040 line they land on, the estimated federal tax "
        "saved, what is still unknown, and a link to a filled-in worksheet to print for a preparer. An owner or bookkeeper pastes "
        "payroll rows and gets each employee's box 12 TP, TT and box 14b with the overtime math for every week. A third tool says "
        "whether a job is on the IRS list of tipped occupations and what the deduction is worth at that job's median pay (BLS). "
        "All three tools are read-only, store nothing they are sent, and file nothing. No account is needed.")
TESTS = [
    ("Work out a server's deductions from W-2 boxes.", "I'm a server, single, AGI $38,000. My W-2 has box 12 TP $14,200, TT $640, box 14b 102. What can I deduct?",
     "tip_overtime_deduction", "Tips deduction $14,200.00, overtime $640.00, total $14,840.00 on Form 1040 line 13a, estimated tax saved $1,674.00, Schedule 1-A lines, rule citations and a worksheet link."),
    ("Estimate from pay stubs before the W-2 arrives.", "No W-2 yet. Single, about $41,000 income, $12,800 in tips as a bartender and 90 hours of overtime at $16 an hour. Roughly what's my deduction?",
     "tip_overtime_deduction", "Tips $12,800.00, overtime $720.00 (90 h x 0.5 x $16), flagged as pay-stub estimates."),
    ("Married filing separately gets nothing.", "I'm married but we file separately. I made $9,000 in tips. Can I deduct them?",
     "tip_overtime_deduction", "Explains no deduction is allowed when married filing separately, with the statute cited."),
    ("Owner computes W-2 boxes from payroll rows.", "Here are my payroll rows: employee,week_start,hours,rate,tips,role / M,2026-03-01,45,15,300,server / M,2026-03-08,38,15,250,server. What goes in box 12 TP, TT and 14b?",
     "w2_tip_overtime_boxes", "M: TP $550, TT $37.50 (5 h over 40 x 0.5 x $15), 14b 102 suggested from the role, flagged to confirm; a sheet link."),
    ("Check whether a job is a tipped occupation.", "Does a bartender qualify for no tax on tips? What's the occupation code?",
     "tipped_occupation_code", "Code 101 Bartenders with the IRS description, BLS median pay $34,340 and $120 saved per $1,000 of tips at that pay."),
]
NEG = [("Asks to file the return.", "File my tax return for me.", "No tool files anything; the assistant explains the connector only calculates."),
       ("Unrelated tax question.", "What's the capital gains rate on stock I held two years?", "No tool is called."),
       ("Paycheck withholding, which the tools do not compute.", "How much federal income tax should my employer withhold from my paycheck?",
        "No tool is called; the assistant answers from general knowledge or points to the IRS withholding estimator, since the tools only work out the tips and overtime deductions and W-2 boxes.")]

plugin = {
    "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    "name": "tip-overtime-deductions", "version": "0.1.1", "description": DESC,
    "author": {"name": "Brick and Mortar AI LLC", "url": SITE + "/"}, "homepage": SITE + "/ai/",
    "repository": "https://github.com/2016judea/tip-overtime-w2", "license": "MIT",
    "keywords": ["no tax on tips", "no tax on overtime", "Schedule 1-A", "W-2"],
    "extensions": {"com.openai": {
        "interface": {"displayName": "Tip & Overtime Deductions", "shortDescription": "No tax on tips and overtime",
            "longDescription": DESC, "developerName": "Brick and Mortar AI LLC", "category": "Finance", "capabilities": [],
            "websiteURL": SITE + "/worksheet/", "supportURL": SITE + "/ai/", "privacyPolicyURL": SITE + "/privacy/", "termsOfServiceURL": SITE + "/terms/",
            "defaultPrompt": ["How much of my tips can I deduct?", "Does no tax on overtime apply to me?", "What goes in W-2 box 12 TP and TT for my staff?"],
            "logo": "./assets/logo.png", "composerIcon": "./assets/composer-icon.png", "composerIconDark": "./assets/composer-icon-dark.png"},
        "review": {"test_cases": {
            "positive": [{"description": d, "prompt": p, "tools_triggered": t, "expected_behavior": e} for d, p, t, e in TESTS],
            "negative": [{"description": d, "prompt": p, "expected_behavior": e} for d, p, e in NEG]}}}},
}
mcp = {"$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", "mcpServers": {"tip-overtime-deductions": {"type": "streamable-http", "url": SITE + "/mcp"}}}
(PKG / "plugin.json").write_text(json.dumps(plugin, indent=2, ensure_ascii=False) + "\n")
(PKG / "mcp.json").write_text(json.dumps(mcp, indent=2) + "\n")
with zipfile.ZipFile(ROOT / "chatgpt-plugin.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(PKG.rglob("*")):
        if f.is_file(): z.write(f, f.relative_to(PKG))
print(f"chatgpt-plugin.zip: {len(DESC)}-char description, {len(TESTS)} positive + {len(NEG)} negative test cases")
