import { Card, CardText, CardTitle } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";

export default function ShellMore() {
  return (
    <PageBody>
      <PageHeader title="עוד" subtitle="שעון נוכחות, דף העסק, הגדרות וחשבון" />
      <Card tone="raised" padding="lg">
        <CardTitle>המסך הזה ייבנה לאורך שלבים 1–5</CardTitle>
        <CardText>בדמו הזה הוא רק מראה שהניווט עובד בכל גודל מסך.</CardText>
      </Card>
    </PageBody>
  );
}
