import { Card, CardText, CardTitle } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";

export default function ShellTeam() {
  return (
    <PageBody>
      <PageHeader title="צוות" subtitle="עובדים, תפקידים והרשאות" />
      <Card tone="raised" padding="lg">
        <CardTitle>המסך הזה ייבנה בשלב 1, יחד עם אשף פתיחת העסק</CardTitle>
        <CardText>בדמו הזה הוא רק מראה שהניווט עובד בכל גודל מסך.</CardText>
      </Card>
    </PageBody>
  );
}
