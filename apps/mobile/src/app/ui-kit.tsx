/**
 * Mobile UI kit. Diagnostics-only. Same primitives the product screens use.
 */

import {
  Badge,
  Body,
  Button,
  Card,
  Heading,
  KeyValue,
  Row,
  Screen,
  Subheading,
} from '@/components/ui';
import { Icon } from '@/components/icon';
import { appConfig } from '@/config/app.config';
import { Radius, Spacing } from '@/constants/theme';
import { color, iconNames, type } from '@world/tokens';

export default function UiKitScreen() {
  if (!appConfig.features.diagnostics) {
    return (
      <Screen>
        <Heading>UI kit is off</Heading>
        <Body muted>Turn features.diagnostics on in packages/config to see primitives.</Body>
      </Screen>
    );
  }

  const palette = color.dark;

  return (
    <Screen>
      <Heading>UI kit</Heading>
      <Body muted>
        Tokens from packages/tokens. These are the same Button / Card / Badge as
        the rest of the app.
      </Body>

      <Card>
        <Subheading>Type</Subheading>
        <Body>body {type.body.fontSize}px</Body>
        <Heading>heading {type.heading.fontSize}px</Heading>
      </Card>

      <Card>
        <Subheading>Buttons</Subheading>
        <Button label="Primary" onPress={() => undefined} />
        <Button label="Secondary" variant="secondary" onPress={() => undefined} />
        <Button label="Danger" variant="danger" onPress={() => undefined} />
        <Button label="Busy" busy onPress={() => undefined} />
        <Button label="Disabled" disabled onPress={() => undefined} />
      </Card>

      <Card>
        <Subheading>Badges</Subheading>
        <Row>
          <Badge label="Neutral" />
          <Badge label="Positive" tone="positive" />
          <Badge label="Warning" tone="warning" />
        </Row>
      </Card>

      <Card>
        <Subheading>Icons</Subheading>
        <Row style={{ flexWrap: 'wrap' }}>
          {iconNames.map((name) => (
            <Icon key={name} name={name} />
          ))}
        </Row>
        <Body muted>{iconNames.join(' · ')}</Body>
      </Card>

      <Card>
        <Subheading>Color (dark tokens)</Subheading>
        <KeyValue label="accent" value={palette.accent} />
        <KeyValue label="bg" value={palette.bg} />
        <KeyValue label="Radius md / space 3" value={`${Radius.md} / ${Spacing.three}`} />
      </Card>
    </Screen>
  );
}
