# Publishing Love Wins live

The data lives in MongoDB (Atlas or your own mongod). Set `MONGODB_URI` and `MONGODB_DB`
everywhere the app runs.

## 0. Deploy on Vercel
1. Push the project to GitHub and import it at vercel.com/new (Vercel detects Express
   automatically, so no build settings are needed).
2. Project Settings > Environment Variables: add `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`
   (32+ random characters), `SITE_URL` (your https URL) and, once you take payments,
   `PESAPAL_ENV`, `PESAPAL_CONSUMER_KEY` and `PESAPAL_CONSUMER_SECRET`.
   Vercel sets `NODE_ENV=production` for you.
3. In Atlas, Network Access: allow `0.0.0.0/0` (Vercel's functions have no fixed IP).
4. Create the first admin from your machine against that same cluster:
   `npm run create-admin -- admin "your-long-password"`
5. Deploy. Files in `public/` are served from Vercel's CDN, everything else hits the
   Express function.
6. Do not rely on SQLite: Vercel's filesystem is read-only apart from `/tmp`, which is
   wiped between requests.

## 1. Domain
Register a domain (e.g. lovewins.org) with any registrar. You will point its DNS A record to your server in step 4.

## 2. Server (about USD 5-6/month)
Create an Ubuntu 24.04 server (DigitalOcean, Hetzner, Linode, Vultr), then:

    sudo apt update && sudo apt install -y nginx ufw git curl build-essential
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
    sudo npm i -g pm2
    sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

## 3. Upload and start the app
    sudo mkdir -p /var/www/love-wins && sudo chown $USER /var/www/love-wins
    # copy the project there (scp -r / rsync / git), then:
    cd /var/www/love-wins && npm install --omit=dev
    npm run setup
    nano .env      # set NODE_ENV=production, SITE_URL=https://yourdomain.org and MONGODB_URI
    chmod 600 .env  # setup already generated a random JWT_SECRET
    npm run create-admin -- admin "your-long-password"
    pm2 start deploy/ecosystem.config.js && pm2 save && pm2 startup

## 4. Nginx, DNS and free HTTPS
    # edit the domain names in deploy/nginx.conf first
    sudo cp deploy/nginx.conf /etc/nginx/sites-available/love-wins
    sudo ln -s /etc/nginx/sites-available/love-wins /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    sudo apt install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.org -d www.yourdomain.org

DNS: add A records for @ and www pointing to the server IP (can take a few hours).

## 5. Real payments (Pesapal: MTN, Airtel, card and bank)
1. Create a Pesapal merchant account and finish verification (NGO registration
   documents, settlement account). Start with the sandbox.
2. Ask Pesapal to confirm that MTN, Airtel, cards and bank payments are enabled
   for your account, and which currencies you may charge.
3. Put the Consumer Key and Secret in `PESAPAL_CONSUMER_KEY` and
   `PESAPAL_CONSUMER_SECRET`, and leave `PESAPAL_ENV=sandbox` while testing.
4. `pm2 restart love-wins`. The IPN URL (`SITE_URL/api/pesapal/ipn`) is registered
   with Pesapal automatically on the first payment. Test with the sandbox test
   cards and mobile numbers from Pesapal's developer docs.
5. Switch to your live keys and set `PESAPAL_ENV=live`, then restart again.

Card numbers, mobile money PINs and bank logins are entered on Pesapal's own page
and never reach this site or database. A payment is only marked successful on the
server after the backend asks Pesapal for the real status.

The admin dashboard's **Payment accounts** tab also stores optional direct-transfer
details for MTN Mobile Money, Airtel Money and bank accounts in MongoDB. These three
methods start disabled. Enter the account name and number, then enable a method to
show it on the donate page. Direct transfers are confirmed manually by the RNI team;
they do not change Pesapal donation statuses automatically. These records are included
in database backups.

Note: every gift is a one-off payment. Monthly giving, receipts and other
currencies need separate setup — ask Pesapal before promising them.

## 6. Backups and updates
Run backups as the same user that owns the app (use `crontab -e`, without sudo).
Add this line, using the absolute Node path returned by `command -v node` if needed:

    0 2 * * * cd /var/www/love-wins && /usr/bin/node scripts/backup.js >> /var/www/love-wins/backup.log 2>&1

Alternatively run `bash scripts/backup.sh` from the project directory.
Backups export every collection to a timestamped JSON file and respect
`BACKUP_DIR` from `.env`. Copy /var/www/love-wins/backups off the server regularly using
your private backup destination. Review and remove old backups after confirming
an off-server copy; backups are not deleted automatically.

Restore: stop the app with `pm2 stop love-wins`, then run:

    npm run restore -- backups/lovewins-<timestamp>.json --force
    pm2 restart love-wins

Restore refuses to overwrite collections that already hold data unless `--force` is passed.
Keep a separate secure copy of `.env`; database backups do not include settings.
Update: upload files, `npm install --omit=dev`, `pm2 restart love-wins`.

## 7. Before announcing
- Replace placeholder email, address, social links (contact page and footer)
- Replace stock Unsplash photos with real, consented photos
- Confirm the 400+ figure; add stories and reports in /admin/
- Have leadership approve privacy.html and safeguarding.html and add real contacts
- Check Uganda data-protection (PDPO) and NGO Bureau requirements for online fundraising
