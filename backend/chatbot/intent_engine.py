import re
from datetime import date
from algorithms.dsrs import calculate_dsrs
from algorithms.recommendation import generate_recommendations
from algorithms.simulator import simulate_clearance

class InventoryChatbot:
    """
    Intent-based Conversational Analytics Assistant for StockGhost.
    Answers natural language queries about dead stock, blocked capital,
    risk tiers, product status, and recommendations.
    """

    def __init__(self, products):
        self.products = products

    def process_query(self, user_text):
        text = user_text.lower().strip()
        if not text:
            return {
                "reply": "Hello! I am your StockGhost Inventory AI assistant. Ask me questions like:\n- *Which product blocks the most capital?*\n- *Show me all dead stock items*\n- *What is the total blocked capital?*\n- *What corrective action should I take for Gaming Keyboard?*\n- *Simulate 25% discount on Gaming Keyboard*",
                "intent": "GREETING",
                "data": None
            }

        # Intent 1: Top Blocked Capital
        if any(phrase in text for phrase in [
            "which product blocks the most capital", "highest blocked capital", "blocks the most capital",
            "most capital tied", "biggest blocked capital", "top blocked capital", "maximum blocked"
        ]):
            return self._handle_top_blocked_capital()

        # Intent 2: Total Blocked Capital
        if any(phrase in text for phrase in [
            "total blocked capital", "how much capital is blocked", "how much money is blocked",
            "total dead stock value", "blocked capital summary", "overall blocked"
        ]):
            return self._handle_total_blocked_capital()

        # Intent 3: Dead Stock List
        if any(phrase in text for phrase in [
            "dead stock items", "which products are dead stock", "list dead stock",
            "show dead stock", "what are dead stocks", "dead stock list"
        ]):
            return self._handle_dead_stock_list()

        # Intent 4: High Risk / Slow Moving List
        if any(phrase in text for phrase in [
            "high risk", "risky items", "slow moving", "slow stock", "stagnant"
        ]):
            return self._handle_high_risk_list()

        # Intent 5: Simulation Query in Chat
        if "simulate" in text or "discount" in text and ("%" in text or "percent" in text):
            match_pct = re.search(r'(\d+)\s*%', text)
            if not match_pct:
                match_pct = re.search(r'(\d+)\s*percent', text)
            discount_val = float(match_pct.group(1)) if match_pct else 25.0
            
            # Find matching product
            matched_prod = self._find_product_in_text(text)
            if matched_prod:
                return self._handle_simulation_in_chat(matched_prod, discount_val)

        # Intent 6: Corrective Action / Recommendation Query
        if any(phrase in text for phrase in [
            "corrective action", "recommendation", "what action", "how to clear",
            "what should i do", "advice", "suggest", "action to take"
        ]):
            matched_prod = self._find_product_in_text(text)
            if matched_prod:
                return self._handle_product_recommendation(matched_prod)
            else:
                return self._handle_general_recommendations()

        # Intent 7: Specific Product Status Query
        matched_prod = self._find_product_in_text(text)
        if matched_prod:
            return self._handle_single_product_status(matched_prod)

        # Intent 8: Overview / General Summary
        if any(phrase in text for phrase in ["overview", "summary", "kpi", "stats", "health", "report", "status"]):
            return self._handle_overview()

        # Fallback / Help
        return {
            "reply": (
                "I couldn't quite find an exact match for your request. You can try asking:\n"
                "• **'Which product blocks the most capital?'**\n"
                "• **'What is the total blocked capital across inventory?'**\n"
                "• **'Show all dead stock items'**\n"
                "• **'What corrective action to take for Gaming Keyboard?'**\n"
                "• **'Simulate 25% discount on Gaming Keyboard'**\n"
                "• **'Give me an inventory overview'**"
            ),
            "intent": "UNKNOWN",
            "data": None
        }

    def _find_product_in_text(self, text):
        # Match SKU or words in name
        for p in self.products:
            sku = p.sku.lower()
            name_words = [w for w in p.name.lower().split() if len(w) > 3]
            if sku in text:
                return p
            for w in name_words:
                if w in text:
                    return p
        return None

    def _handle_top_blocked_capital(self):
        ranked = []
        for p in self.products:
            res = calculate_dsrs(p)
            ranked.append((p, res, res["inventory_value"]))
        
        ranked.sort(key=lambda x: x[2], reverse=True)
        top = ranked[0]
        prod, dsrs, val = top
        
        reply = (
            f"💰 **Top Blocked Capital Item:**\n\n"
            f"**{prod.name}** (SKU: `{prod.sku}`) blocks the largest amount of capital: **₹{val:,.2f}**.\n\n"
            f"• **Current Stock:** {prod.current_stock} units\n"
            f"• **Stock Age:** {dsrs['stock_age_days']} days (No sales in {dsrs['days_since_last_sale']} days)\n"
            f"• **DSRS Score:** **{dsrs['score']}/100** ({dsrs['tier']})\n\n"
            f"💡 **Recommended Action:** Execute an immediate **25% clearance discount** to recover up to ₹5,25,000 and lower its risk score to 38."
        )
        return {
            "reply": reply,
            "intent": "TOP_BLOCKED_CAPITAL",
            "data": {
                "product_id": prod.id,
                "name": prod.name,
                "blocked_capital": val,
                "score": dsrs["score"],
                "tier": dsrs["tier"]
            }
        }

    def _handle_total_blocked_capital(self):
        total_blocked = 0.0
        total_inv_val = 0.0
        dead_count = 0
        high_risk_count = 0

        for p in self.products:
            res = calculate_dsrs(p)
            val = p.current_stock * p.cost_price
            total_inv_val += val
            if res["is_blocked"]:
                total_blocked += val
                if res["tier"] == "Dead Stock":
                    dead_count += 1
                elif res["tier"] == "High Risk":
                    high_risk_count += 1

        pct_blocked = (total_blocked / total_inv_val * 100) if total_inv_val > 0 else 0

        reply = (
            f"📊 **Blocked Capital Summary:**\n\n"
            f"• **Total Inventory Value:** ₹{total_inv_val:,.2f}\n"
            f"• **Total Blocked Capital:** **₹{total_blocked:,.2f}** ({pct_blocked:.1f}% of total inventory!)\n"
            f"• **Dead Stock SKUs:** {dead_count} items\n"
            f"• **High Risk SKUs:** {high_risk_count} items\n\n"
            f"⚠️ Capital is locked primarily in non-moving electronics and slow turnover hardware. Check the **Recommendations** and **Simulator** tabs to take action."
        )
        return {
            "reply": reply,
            "intent": "TOTAL_BLOCKED_CAPITAL",
            "data": {
                "total_inventory_value": total_inv_val,
                "total_blocked_capital": total_blocked,
                "dead_stock_count": dead_count,
                "high_risk_count": high_risk_count
            }
        }

    def _handle_dead_stock_list(self):
        dead_items = []
        for p in self.products:
            res = calculate_dsrs(p)
            if res["tier"] == "Dead Stock":
                dead_items.append((p, res))

        if not dead_items:
            return {
                "reply": "Great news! There are currently **no products** classified in the Dead Stock tier.",
                "intent": "DEAD_STOCK_LIST",
                "data": []
            }

        lines = [f"🚨 **Found {len(dead_items)} Dead Stock Items (DSRS >= 81):**\n"]
        for p, r in dead_items:
            val = p.current_stock * p.cost_price
            lines.append(f"• **{p.name}** (`{p.sku}`) — {p.current_stock} units | Value: **₹{val:,.2f}** | DSRS: **{r['score']}** (No sale in {r['days_since_last_sale']}d)")

        lines.append("\n👉 Run the **Clearance Simulator** to test recovery scenarios for these items.")
        return {
            "reply": "\n".join(lines),
            "intent": "DEAD_STOCK_LIST",
            "data": [{"name": p.name, "sku": p.sku, "dsrs": r["score"]} for p, r in dead_items]
        }

    def _handle_high_risk_list(self):
        risky_items = []
        for p in self.products:
            res = calculate_dsrs(p)
            if res["tier"] in ["High Risk", "Slow Moving"]:
                risky_items.append((p, res))

        lines = [f"⚠️ **Found {len(risky_items)} High Risk & Slow-Moving Products:**\n"]
        for p, r in risky_items:
            val = p.current_stock * p.cost_price
            lines.append(f"• **{p.name}** — Tier: **{r['tier']}** | DSRS: **{r['score']}** | Stock: {p.current_stock} units (₹{val:,.2f})")

        return {
            "reply": "\n".join(lines),
            "intent": "HIGH_RISK_LIST",
            "data": [{"name": p.name, "tier": r["tier"], "dsrs": r["score"]} for p, r in risky_items]
        }

    def _handle_single_product_status(self, prod):
        res = calculate_dsrs(prod)
        val = prod.current_stock * prod.cost_price
        reply = (
            f"📦 **Product Diagnostic: {prod.name}** (`{prod.sku}`)\n\n"
            f"• **Category:** {prod.category.name if prod.category else 'General'}\n"
            f"• **Current Stock:** {prod.current_stock} units\n"
            f"• **Inventory Value:** ₹{val:,.2f}\n"
            f"• **Stock Age:** {res['stock_age_days']} days\n"
            f"• **Days Since Last Sale:** {res['days_since_last_sale']} days\n"
            f"• **DSRS Score:** **{res['score']}/100** ({res['tier']})\n"
            f"• **Capital Status:** {'🔒 Blocked Capital' if res['is_blocked'] else '✅ Active/Healthy Capital'}"
        )
        return {
            "reply": reply,
            "intent": "PRODUCT_STATUS",
            "data": {
                "product_id": prod.id,
                "name": prod.name,
                "dsrs": res["score"],
                "tier": res["tier"],
                "inventory_value": val
            }
        }

    def _handle_product_recommendation(self, prod):
        res = calculate_dsrs(prod)
        recs = generate_recommendations(prod, res)
        lines = [f"💡 **Recommended Recovery Strategy for {prod.name}:**\n"]
        for i, r in enumerate(recs, 1):
            lines.append(f"**{i}. {r['title']}** [{r['priority']} Priority]")
            lines.append(f"   {r['details']}")
            if r['expected_recovery'] > 0:
                lines.append(f"   *Estimated Cash Recovery:* **₹{r['expected_recovery']:,.2f}**\n")
        return {
            "reply": "\n".join(lines),
            "intent": "RECOMMENDATION_QUERY",
            "data": recs
        }

    def _handle_general_recommendations(self):
        return {
            "reply": (
                "🎯 **Top Corrective Actions Across Catalog:**\n\n"
                "1. **Execute 25% Flash Sale for Dead Stock**: Apply on items like Gaming Keyboard (500 units) to release ₹5,25,000 cash.\n"
                "2. **Bundle High-Risk Accessories**: Combine RGB Mousepads and Mechanical Mice with top-selling PCs.\n"
                "3. **Halt Procurement Reorders**: Freeze purchase orders on all items currently tagged as Slow Moving or High Risk."
            ),
            "intent": "RECOMMENDATION_QUERY",
            "data": None
        }

    def _handle_simulation_in_chat(self, prod, discount_val):
        res = calculate_dsrs(prod)
        sim = simulate_clearance(prod, res, discount_val)
        reply = (
            f"🧮 **Clearance Simulation Result for {prod.name}:**\n\n"
            f"• **Discount Applied:** {sim['discount_percent']}%\n"
            f"• **Discounted Unit Price:** ₹{sim['discounted_unit_price']:,.2f} (Original: ₹{sim['original_price']:,.2f})\n"
            f"• **Estimated Units Cleared:** **{sim['units_sold']}** of {prod.current_stock} units\n"
            f"• **Capital Recovered:** **₹{sim['recovered_capital']:,.2f}**\n"
            f"• **Remaining Unsold Units:** {sim['remaining_units']} units (₹{sim['remaining_capital']:,.2f})\n"
            f"• **DSRS Score Impact:** Drops from **{sim['original_dsrs']}** ({sim['original_tier']}) ➔ **{sim['new_dsrs']}** ({sim['new_tier']})! (📉 {sim['risk_reduction_points']} pts reduction)"
        )
        return {
            "reply": reply,
            "intent": "SIMULATION_QUERY",
            "data": sim
        }

    def _handle_overview(self):
        total_items = len(self.products)
        total_stock = sum(p.current_stock for p in self.products)
        total_val = sum(p.current_stock * p.cost_price for p in self.products)
        
        dead_cnt = 0
        slow_cnt = 0
        healthy_cnt = 0
        blocked_cap = 0.0

        for p in self.products:
            r = calculate_dsrs(p)
            if r["tier"] == "Dead Stock":
                dead_cnt += 1
                blocked_cap += (p.current_stock * p.cost_price)
            elif r["tier"] == "High Risk":
                blocked_cap += (p.current_stock * p.cost_price)
            elif r["tier"] == "Slow Moving":
                slow_cnt += 1
            else:
                healthy_cnt += 1

        reply = (
            f"🏢 **StockGhost Inventory Health Report:**\n\n"
            f"• **Catalog Size:** {total_items} distinct SKUs ({total_stock} total units)\n"
            f"• **Total Valuation:** ₹{total_val:,.2f}\n"
            f"• **Blocked Capital:** **₹{blocked_cap:,.2f}**\n"
            f"• **Healthy SKUs:** {healthy_cnt}\n"
            f"• **Slow Moving:** {slow_cnt}\n"
            f"• **Dead Stock / High Risk:** {dead_cnt}\n\n"
            f"You can view complete visual charts and breakdown graphs on the **Dashboard**."
        )
        return {
            "reply": reply,
            "intent": "INVENTORY_OVERVIEW",
            "data": {
                "total_items": total_items,
                "total_val": total_val,
                "blocked_cap": blocked_cap
            }
        }
