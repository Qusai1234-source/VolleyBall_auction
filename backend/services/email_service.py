import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from email.mime.image import MIMEImage

TEAM_BRAND = {
    '11111111-0001-0001-0001-000000000001': '#C47F17',
    '11111111-0002-0002-0002-000000000002': '#00a3c8',
    '11111111-0003-0003-0003-000000000003': '#1A8A3A',
    '11111111-0004-0004-0004-000000000004': '#7C3FAB',
    '11111111-0005-0005-0005-000000000005': '#A89B18',
    '11111111-0006-0006-0006-000000000006': '#CC2020',
}

def _get_team_gradient_rgb(team_id: str | None) -> str:
    if not team_id:
        return "107, 114, 128"
    color = TEAM_BRAND.get(team_id.lower(), '#6B7280')
    color = color.lstrip('#')
    if len(color) >= 6:
        r, g, b = int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)
        return f"{r}, {g}, {b}"
    return "107, 114, 128"


def _get_smtp_config():
    return {
        "host":     os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port":     int(os.getenv("SMTP_PORT", "587")),
        "user":     os.getenv("SMTP_USER"),        # your Gmail address
        "password": os.getenv("SMTP_PASSWORD"),    # Gmail App Password (not account password)
        "to":       os.getenv("NOTIFY_EMAIL"),     # organiser email to receive alerts
    }


def send_sold_notification(
    player_id: str,
    player_name: str,
    player_position: str | None,
    player_class: str | None,
    team_name: str,
    sold_amount: int,
    base_price: int | None = None,
    player_photo_url: str | None = None,
    team_id: str | None = None,
) -> bool:
    """
    Send an EA FC / Ultimate Team style trading card notification.
    """
    cfg = _get_smtp_config()

    if not cfg["user"] or not cfg["password"] or not cfg["to"]:
        print("[Email] SMTP_USER, SMTP_PASSWORD, or NOTIFY_EMAIL not set — skipping")
        return False

    try:
        fmt_inr = lambda n: f"₹{n:,}" if n else "—"
        now     = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
        
        premium = round(((sold_amount - (base_price or sold_amount)) / (base_price or sold_amount)) * 100) if base_price else 0
        premium_str = f"+{premium}% over base" if premium > 0 else ("at base price" if premium == 0 else f"{premium}% under base")

        subject = f"SOLD 🟢 {player_name} to {team_name} for {fmt_inr(sold_amount)}"
        
        # Cloudinary URLs
        final_player_img = player_photo_url if player_photo_url else f"https://res.cloudinary.com/dniwpu2tt/image/upload/f_auto/{player_id}.jpg"
        final_team_img = f"https://res.cloudinary.com/dniwpu2tt/image/upload/f_auto/{team_id}.png" if team_id else ""

        position_html = f'<span style="display:inline-block; font-size:11px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; border:1px solid #9A3412; color:#F97316; padding: 4px 10px;">{player_position}</span>' if player_position else ""
        class_html = f'<span style="display:inline-block; font-size:11px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; border:1px solid #854D0E; color:#FACC15; padding: 4px 10px;">{player_class}</span>' if player_class else ""

        html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0; padding:0; background-color:#02040A; font-family:'Helvetica Neue', Arial, sans-serif;">
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#02040A; padding:40px 16px;">
    <tr><td align="center">
      
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#0A0C10; max-width:600px; width:100%; border: 1px solid #1E293B;">
        
        <!-- Header -->
        <tr>
          <td colspan="2" style="padding: 24px 32px 20px 32px; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="font-size:11px; font-weight:700; letter-spacing:4px; text-transform:uppercase; color:#FACC15; margin-bottom:8px;">TKM Volleyball &nbsp;&middot;&nbsp; Auction Alert</div>
            <div style="font-size:36px; letter-spacing:0.5px; color:#F8FAFC; line-height:1; font-weight:400;">Player Sold</div>
          </td>
        </tr>

        <!-- Photo and Name -->
        <tr>
          <td width="140" valign="top" style="padding: 32px 0 0 32px;">
            <img src="{final_player_img}" width="140" height="175" style="display:block; width:140px; height:175px; object-fit:cover; border-radius:4px; background-color:#1E293B;" alt="{player_name}" />
          </td>
          <td valign="top" style="padding: 32px 32px 0 24px;">
            <div style="font-size:11px; letter-spacing:3px; text-transform:uppercase; color:#64748B; margin-bottom:10px; font-weight:600;">Player</div>
            <div style="font-size:46px; color:#F8FAFC; line-height:1.1; font-weight:400; font-family:'Helvetica Neue', Helvetica, Arial, sans-serif; margin-bottom:16px;">{player_name}</div>
            
            <table cellpadding="0" cellspacing="0">
              <tr>
                {f'<td style="padding-right:8px;">{position_html}</td>' if player_position else ''}
                {f'<td>{class_html}</td>' if player_class else ''}
              </tr>
            </table>

          </td>
        </tr>

        <!-- Sold To & Final Price (2 cols) -->
        <tr>
          <td colspan="2" style="padding: 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                
                <td width="48%" valign="top">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(255,255,255,0.08); background-color: #0F131A;">
                    <tr>
                      <td style="padding: 20px 24px;">
                        <div style="font-size:10px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#64748B; margin-bottom:12px;">Sold To</div>
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            {f'<td valign="middle" style="padding-right:12px;"><img src="{final_team_img}" width="36" height="36" style="border-radius:50%; object-fit:cover; display:block;" alt="Logo"/></td>' if final_team_img else ''}
                            <td valign="middle" style="font-size:32px; color:#F8FAFC; line-height:1; font-weight:400; font-family:'Helvetica Neue', Arial, sans-serif;">
                              {team_name}
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
                
                <td width="4%"></td>
                
                <td width="48%" valign="top">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(255,215,0,0.3); background-color: #0F131A;">
                    <tr>
                      <td style="padding: 20px 24px;">
                        <div style="font-size:10px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#64748B; margin-bottom:12px;">Final Price</div>
                        <div style="font-size:36px; color:#FACC15; line-height:1; font-weight:400; font-family:'Helvetica Neue', Arial, sans-serif;">{fmt_inr(sold_amount)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
                
              </tr>
            </table>
          </td>
        </tr>

        <!-- Base Price -->
        {f'''<tr>
          <td colspan="2" style="padding: 0 32px 32px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(255,255,255,0.05); background-color: #0F131A;">
              <tr>
                <td style="padding: 16px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="left" style="font-size:11px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#64748B;">
                        Base Price
                      </td>
                      <td align="right" style="font-size:14px; color:#94A3B8; font-weight:500;">
                        {fmt_inr(base_price)} &nbsp;<span style="color:#475569;">&middot;</span>&nbsp; <span style="color:{"#4ADE80" if premium > 0 else ("#94A3B8" if premium == 0 else "#F87171")};">{premium_str}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>''' if base_price else ""}

        <!-- Footer -->
        <tr>
          <td colspan="2" style="padding: 24px 32px; border-top: 1px solid rgba(255,255,255,0.05);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="font-size:11px; color:#475569; letter-spacing:1px; font-weight:500;">
                    {now} &nbsp;&middot;&nbsp; TKM Volleyball Live Auction
                  </td>
                  <td align="right">
                    <span style="font-size:10px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#FACC15; border:1px solid rgba(250,204,21,0.4); padding:4px 12px;">LIVE</span>
                  </td>
                </tr>
              </table>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>
"""

        plain = f"SOLD: {player_name} → {team_name} for {fmt_inr(sold_amount)}"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"TKM Auction <{cfg['user']}>"
        msg["To"]      = cfg["to"]
        
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html,  "html"))

        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.ehlo()
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["user"], cfg["to"], msg.as_string())

        print(f"[Email] Sold notification sent: {player_name} → {team_name}")
        return True

    except Exception as e:
        print(f"[Email] Failed to send sold notification: {e}")
        return False