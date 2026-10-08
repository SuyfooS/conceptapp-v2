import { Card, CardText, CardTitle } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";

export default function ShellReservations() {
  return (
    <PageBody>
      <PageHeader title="הזמנות" subtitle="מפת שולחנות, הזמנות היום ואישורים" />
      <Card tone="raised" padding="lg">
        <CardTitle>המסך הזה ייבנה בשלבים 6–7</CardTitle>
        <CardText>בדמו הזה הוא רק מראה שהניווט עובד בכל גודל מסך.</CardText>
      </Card>
    </PageBody>
  );
}
