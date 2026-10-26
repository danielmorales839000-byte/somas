# Admin analytics and example discussions

The authenticated navigation shows To admin panel directly before the user mark for active, verified staff (owner, administrator, assistor), matching existing server permissions. Regular members and visitors receive no admin data; the server checks every request.

The panel shows database totals, 30 daily UTC aggregates, role counts, inquiry review statuses, users, private feedback/contact, meeting requests and scheduled Google-backed meeting records in tables. Click a row to open a 640px details dialog. The admin navigation contains Overview and Moderation; To user panel returns to the public Dashboard, where To admin panel reappears. Totals cover the database; searchable lists are bounded to the latest 100 records. Page views and unique visitors are not collected. Scheduled meetings are database records; opening a meeting exposes the existing status/reconciliation controls. No new migration is needed on the v4 baseline.

55 static, fictional discussion starters appear in their own expandable, searchable section. They do not create auth users or community rows, send mail, receive votes/replies, or affect admin totals.

Design references: https://www.nngroup.com/articles/dashboards-preattentive/ and https://www.nngroup.com/articles/data-tables/ — clear comparisons, searchable records, actionable status queues.

Apply ZIP over the existing v4.1 project. Run npm run check, commit and push only when ready for automatic production deployment. No deployment was performed here.
