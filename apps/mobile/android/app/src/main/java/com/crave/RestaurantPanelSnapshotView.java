package com.crave;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import java.util.List;

public class RestaurantPanelSnapshotView extends LinearLayout {
  public static final String EVENT_ACTION = "topAction";

  private static final String ACTION_CLOSE = "close";
  private static final String ACTION_FAVORITE = "favorite";
  private static final String ACTION_SHARE = "share";
  private static final String ACTION_WEBSITE = "website";
  private static final String ACTION_CALL = "call";

  private static final int H_PADDING_DP = 20;
  private static final int CARD_RADIUS_DP = 16;
  private static final int LOCATION_RADIUS_DP = 14;
  private static final int DISH_RANK_SIZE_DP = 32;
  private static final int ACTION_PILL_RADIUS_DP = 18;
  private static final int ACTION_ICON_SIZE_SP = 16;

  private RestaurantPanelSnapshotPayload snapshotPayload;

  public RestaurantPanelSnapshotView(@NonNull Context context) {
    super(context);
    setOrientation(VERTICAL);
    setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
  }

  public void setSnapshot(ReadableMap nextSnapshot) {
    RestaurantPanelSnapshotPayload nextSnapshotPayload =
      RestaurantPanelSnapshotPayload.fromReadableMap(nextSnapshot);
    if (nextSnapshotPayload == null && snapshotPayload == null) {
      return;
    }
    snapshotPayload = nextSnapshotPayload;
    renderSnapshot();
  }

  private void renderSnapshot() {
    removeAllViews();
    if (snapshotPayload == null) {
      return;
    }
    RestaurantPanelSnapshotPayload payload = snapshotPayload;
    addView(createHandle());
    addView(createHeader(payload));
    addView(createMetricsRow(payload));
    addView(createDetailRow("Price", payload.priceLabel));
    addView(createDetailRow("Hours", payload.hoursSummary));
    addView(createPrimaryActionsRow(payload));

    if (!payload.locations.isEmpty()) {
      addView(createSectionHeader("Locations", payload.locationsLabel));
      for (RestaurantPanelSnapshotPayload.Location location : payload.locations) {
        addView(createLocationCard(location));
      }
    }

    addView(createSectionHeader("Menu highlights", "Ranked by dish score"));
    if (payload.isLoading) {
      addView(createLoadingState());
    } else if (payload.dishes.isEmpty()) {
      addView(createEmptyState());
    } else {
      int rank = 1;
      for (RestaurantPanelSnapshotPayload.Dish dish : payload.dishes) {
        addView(createDishCard(dish, rank));
        rank += 1;
      }
    }
  }

  private View createHandle() {
    LinearLayout wrapper = new LinearLayout(getContext());
    wrapper.setOrientation(VERTICAL);
    wrapper.setPadding(0, dp(12), 0, dp(8));
    wrapper.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

    View handle = new View(getContext());
    LayoutParams handleParams = new LayoutParams(dp(40), dp(5));
    handleParams.gravity = Gravity.CENTER_HORIZONTAL;
    handle.setLayoutParams(handleParams);
    handle.setBackground(createRoundedBackground(Color.parseColor("#d1d5db"), dp(3), 0));
    wrapper.addView(handle);
    return wrapper;
  }

  private View createHeader(RestaurantPanelSnapshotPayload payload) {
    LinearLayout header = new LinearLayout(getContext());
    header.setOrientation(VERTICAL);
    header.setPadding(dp(H_PADDING_DP), 0, dp(H_PADDING_DP), 0);
    header.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

    LinearLayout row = new LinearLayout(getContext());
    row.setOrientation(HORIZONTAL);
    row.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

    LinearLayout textGroup = new LinearLayout(getContext());
    textGroup.setOrientation(VERTICAL);
    LayoutParams textGroupParams = new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f);
    textGroup.setLayoutParams(textGroupParams);

    textGroup.addView(
      createText(payload.restaurantName, 24, "#0f172a", Typeface.BOLD)
    );
    TextView address = createText(
      payload.primaryAddress,
      15,
      "#475569",
      Typeface.NORMAL
    );
    LayoutParams addressParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    addressParams.topMargin = dp(4);
    address.setLayoutParams(addressParams);
    textGroup.addView(address);
    row.addView(textGroup);

    LinearLayout actions = new LinearLayout(getContext());
    actions.setOrientation(HORIZONTAL);
    LayoutParams actionsParams = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
    actions.setLayoutParams(actionsParams);
    actions.addView(
      createIconButton(
        payload.isFavorite ? "\u2665" : "\u2661",
        payload.favoriteEnabled,
        ACTION_FAVORITE,
        payload.isFavorite ? "#ef4444" : "#1f2937"
      )
    );
    actions.addView(createIconButton("\u21B1", true, ACTION_SHARE, "#1f2937"));
    actions.addView(createIconButton("\u00D7", true, ACTION_CLOSE, "#1f2937"));
    row.addView(actions);
    header.addView(row);

    View divider = new View(getContext());
    LayoutParams dividerParams = new LayoutParams(LayoutParams.MATCH_PARENT, dp(1));
    dividerParams.topMargin = dp(16);
    divider.setLayoutParams(dividerParams);
    divider.setBackgroundColor(Color.parseColor("#e5e7eb"));
    header.addView(divider);
    return header;
  }

  private View createMetricsRow(RestaurantPanelSnapshotPayload payload) {
    LinearLayout row = new LinearLayout(getContext());
    row.setOrientation(HORIZONTAL);
    row.setPadding(dp(H_PADDING_DP), dp(16), dp(H_PADDING_DP), 0);
    row.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

    row.addView(createMetricCard("Restaurant score", payload.restaurantScore, 0));
    row.addView(
      createMetricCard(
        payload.queryScoreLabel,
        payload.queryScoreValue,
        dp(12)
      )
    );
    return row;
  }

  private View createMetricCard(String label, String value, int leftMargin) {
    LinearLayout card = new LinearLayout(getContext());
    card.setOrientation(VERTICAL);
    LayoutParams params = new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f);
    params.leftMargin = leftMargin;
    card.setLayoutParams(params);
    card.setPadding(dp(16), dp(16), dp(16), dp(16));
    card.setBackground(
      createRoundedBackground(Color.WHITE, dp(CARD_RADIUS_DP), Color.parseColor("#140f172a"))
    );

    card.addView(createText(label, 14, "#475569", Typeface.NORMAL));
    TextView valueView = createText(value, 24, "#0f172a", Typeface.BOLD);
    LayoutParams valueParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    valueParams.topMargin = dp(4);
    valueView.setLayoutParams(valueParams);
    card.addView(valueView);
    return card;
  }

  private View createDetailRow(String label, String value) {
    LinearLayout row = new LinearLayout(getContext());
    row.setOrientation(HORIZONTAL);
    row.setPadding(dp(H_PADDING_DP), dp(16), dp(H_PADDING_DP), 0);
    row.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

    TextView left = createText(label, 15, "#0f172a", Typeface.BOLD);
    LayoutParams leftParams = new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f);
    left.setLayoutParams(leftParams);
    row.addView(left);

    TextView right = createText(value, 15, "#475569", Typeface.NORMAL);
    right.setTextAlignment(TEXT_ALIGNMENT_VIEW_END);
    row.addView(right);
    return row;
  }

  private View createPrimaryActionsRow(RestaurantPanelSnapshotPayload payload) {
    LinearLayout row = new LinearLayout(getContext());
    row.setOrientation(HORIZONTAL);
    row.setPadding(dp(H_PADDING_DP), dp(16), dp(H_PADDING_DP), 0);
    row.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

    if (payload.showWebsiteAction) {
      row.addView(createActionPill("Website", ACTION_WEBSITE));
    }
    if (payload.showCallAction) {
      row.addView(createActionPill("Call", ACTION_CALL));
    }
    return row;
  }

  private View createSectionHeader(String title, String subtitle) {
    LinearLayout section = new LinearLayout(getContext());
    section.setOrientation(VERTICAL);
    section.setPadding(dp(H_PADDING_DP), dp(24), dp(H_PADDING_DP), 0);
    section.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

    section.addView(createText(title, 18, "#0f172a", Typeface.BOLD));
    TextView subtitleView = createText(subtitle, 15, "#475569", Typeface.NORMAL);
    LayoutParams subtitleParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    subtitleParams.topMargin = dp(2);
    subtitleView.setLayoutParams(subtitleParams);
    section.addView(subtitleView);
    return section;
  }

  private View createLocationCard(RestaurantPanelSnapshotPayload.Location location) {
    LinearLayout card = new LinearLayout(getContext());
    card.setOrientation(VERTICAL);
    LayoutParams params = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    params.leftMargin = dp(H_PADDING_DP);
    params.rightMargin = dp(H_PADDING_DP);
    params.topMargin = dp(12);
    card.setLayoutParams(params);
    card.setPadding(dp(14), dp(12), dp(14), dp(12));
    card.setBackground(
      createRoundedBackground(Color.WHITE, dp(LOCATION_RADIUS_DP), Color.parseColor("#140f172a"))
    );

    LinearLayout titleRow = new LinearLayout(getContext());
    titleRow.setOrientation(HORIZONTAL);
    titleRow.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
    TextView title = createText(location.title, 16, "#0f172a", Typeface.BOLD);
    LayoutParams titleParams = new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f);
    title.setLayoutParams(titleParams);
    titleRow.addView(title);
    String status = location.status != null ? location.status : "";
    if (!status.isEmpty()) {
      titleRow.addView(createText(status, 14, "#475569", Typeface.NORMAL));
    }
    TextView chevron = createText("\u2304", 16, "#475569", Typeface.NORMAL);
    LayoutParams chevronParams = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
    chevronParams.leftMargin = dp(8);
    chevron.setLayoutParams(chevronParams);
    titleRow.addView(chevron);
    card.addView(titleRow);

    LinearLayout details = new LinearLayout(getContext());
    details.setOrientation(VERTICAL);
    LayoutParams detailsParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    detailsParams.topMargin = dp(10);
    details.setLayoutParams(detailsParams);
    details.setVisibility(GONE);
    details.addView(createDetailLabel("Address"));
    details.addView(createDetailValue(location.address, 4));

    if (location.phone != null && !location.phone.isEmpty()) {
      details.addView(createDetailLabel("Phone", 10));
      details.addView(createDetailValue(location.phone, 4));
    }

    List<RestaurantPanelSnapshotPayload.HoursRow> hoursRows = location.hoursRows;
    if (!hoursRows.isEmpty()) {
      TextView hoursLabel = createDetailLabel("Hours", 10);
      details.addView(hoursLabel);
      for (RestaurantPanelSnapshotPayload.HoursRow row : hoursRows) {
        LinearLayout hourRow = new LinearLayout(getContext());
        hourRow.setOrientation(HORIZONTAL);
        LayoutParams hourParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
        hourParams.topMargin = dp(4);
        hourRow.setLayoutParams(hourParams);
        TextView day = createText(row.label, 12, "#475569", Typeface.NORMAL);
        LayoutParams dayParams = new LayoutParams(dp(32), LayoutParams.WRAP_CONTENT);
        day.setLayoutParams(dayParams);
        hourRow.addView(day);
        TextView value = createText(row.value, 12, "#475569", Typeface.NORMAL);
        LayoutParams valueParams = new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f);
        value.setLayoutParams(valueParams);
        value.setTextAlignment(TEXT_ALIGNMENT_VIEW_END);
        hourRow.addView(value);
        details.addView(hourRow);
      }
    }

    if (location.websiteHost != null && !location.websiteHost.isEmpty()) {
      details.addView(createDetailLabel("Website", 10));
      details.addView(createDetailValue(location.websiteHost, 4));
    }

    titleRow.setOnClickListener(
      view -> {
        boolean expand = details.getVisibility() != VISIBLE;
        details.setVisibility(expand ? VISIBLE : GONE);
        chevron.setText(expand ? "\u2303" : "\u2304");
      }
    );
    card.addView(details);
    return card;
  }

  private View createDishCard(RestaurantPanelSnapshotPayload.Dish dish, int rank) {
    LinearLayout card = new LinearLayout(getContext());
    card.setOrientation(VERTICAL);
    LayoutParams params = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    params.topMargin = dp(4);
    card.setLayoutParams(params);
    card.setPadding(dp(H_PADDING_DP), dp(16), dp(H_PADDING_DP), dp(16));
    card.setBackgroundColor(Color.WHITE);

    LinearLayout topRow = new LinearLayout(getContext());
    topRow.setOrientation(HORIZONTAL);
    topRow.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
    topRow.addView(createCenteredBadge(String.valueOf(rank)));

    LinearLayout textColumn = new LinearLayout(getContext());
    textColumn.setOrientation(VERTICAL);
    LayoutParams textParams = new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f);
    textParams.leftMargin = dp(12);
    textColumn.setLayoutParams(textParams);
    textColumn.addView(createText(dish.name, 16, "#0f172a", Typeface.BOLD));
    TextView meta = createText(
      "Dish score: " + dish.score,
      14,
      "#475569",
      Typeface.NORMAL
    );
    LayoutParams metaParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    metaParams.topMargin = dp(2);
    meta.setLayoutParams(metaParams);
    textColumn.addView(meta);
    topRow.addView(textColumn);
    topRow.addView(createText(dish.activity, 14, "#475569", Typeface.NORMAL));
    card.addView(topRow);

    LinearLayout statsRow = new LinearLayout(getContext());
    statsRow.setOrientation(HORIZONTAL);
    LayoutParams statsParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    statsParams.topMargin = dp(14);
    statsRow.setLayoutParams(statsParams);
    statsRow.addView(createStatColumn("Poll count", dish.pollCount, 0));
    statsRow.addView(createStatColumn("Total votes", dish.totalVotes, dp(16)));
    card.addView(statsRow);
    return card;
  }

  private View createStatColumn(String label, String value, int leftMargin) {
    LinearLayout column = new LinearLayout(getContext());
    column.setOrientation(VERTICAL);
    LayoutParams params = new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f);
    params.leftMargin = leftMargin;
    column.setLayoutParams(params);
    column.addView(createText(label, 13, "#475569", Typeface.NORMAL));
    TextView valueView = createText(value, 15, "#0f172a", Typeface.BOLD);
    LayoutParams valueParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    valueParams.topMargin = dp(4);
    valueView.setLayoutParams(valueParams);
    column.addView(valueView);
    return column;
  }

  private View createLoadingState() {
    LinearLayout state = new LinearLayout(getContext());
    state.setOrientation(VERTICAL);
    state.setGravity(Gravity.CENTER_HORIZONTAL);
    LayoutParams params = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    params.topMargin = dp(28);
    params.bottomMargin = dp(48);
    state.setLayoutParams(params);
    ProgressBar indicator = new ProgressBar(getContext());
    state.addView(indicator);
    TextView label = createText("Loading restaurant details…", 15, "#475569", Typeface.NORMAL);
    LayoutParams labelParams = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
    labelParams.topMargin = dp(12);
    label.setLayoutParams(labelParams);
    state.addView(label);
    return state;
  }

  private View createEmptyState() {
    TextView empty = createText("No dishes found for this restaurant.", 15, "#475569", Typeface.NORMAL);
    LayoutParams params = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    params.leftMargin = dp(H_PADDING_DP);
    params.rightMargin = dp(H_PADDING_DP);
    params.topMargin = dp(24);
    params.bottomMargin = dp(40);
    empty.setLayoutParams(params);
    empty.setTextAlignment(TEXT_ALIGNMENT_CENTER);
    return empty;
  }

  private TextView createCenteredBadge(String text) {
    TextView badge = createText(text, 14, "#b45309", Typeface.BOLD);
    LayoutParams params = new LayoutParams(dp(DISH_RANK_SIZE_DP), dp(DISH_RANK_SIZE_DP));
    badge.setLayoutParams(params);
    badge.setGravity(Gravity.CENTER);
    badge.setBackground(createRoundedBackground(Color.parseColor("#fef3c7"), dp(16), 0));
    return badge;
  }

  private View createActionPill(String label, String action) {
    TextView pill = createText(label, 14, "#0f172a", Typeface.BOLD);
    LayoutParams params = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
    params.rightMargin = dp(10);
    pill.setLayoutParams(params);
    pill.setPadding(dp(14), dp(10), dp(14), dp(10));
    pill.setBackground(
      createRoundedBackground(Color.parseColor("#ffffff"), dp(ACTION_PILL_RADIUS_DP), Color.parseColor("#140f172a"))
    );
    pill.setOnClickListener(view -> emitAction(action));
    return pill;
  }

  private View createIconButton(String label, boolean enabled, String action, String color) {
    TextView button = createText(label, ACTION_ICON_SIZE_SP, color, Typeface.BOLD);
    LayoutParams params = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
    params.leftMargin = dp(8);
    button.setLayoutParams(params);
    button.setPadding(dp(8), dp(6), dp(8), dp(6));
    button.setEnabled(enabled);
    button.setAlpha(enabled ? 1f : 0.45f);
    if (enabled) {
      button.setOnClickListener(view -> emitAction(action));
    }
    return button;
  }

  private TextView createDetailLabel(String text) {
    return createDetailLabel(text, 0);
  }

  private TextView createDetailLabel(String text, int topMarginDp) {
    TextView label = createText(text, 14, "#0f172a", Typeface.BOLD);
    LayoutParams params = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    params.topMargin = dp(topMarginDp);
    label.setLayoutParams(params);
    return label;
  }

  private TextView createDetailValue(String text, int topMarginDp) {
    TextView value = createText(text, 14, "#475569", Typeface.NORMAL);
    LayoutParams params = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    params.topMargin = dp(topMarginDp);
    value.setLayoutParams(params);
    return value;
  }

  private TextView createText(String text, int textSizeSp, String color, int typefaceStyle) {
    TextView view = new TextView(getContext());
    view.setText(text);
    view.setTextColor(Color.parseColor(color));
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp);
    view.setTypeface(Typeface.create(Typeface.DEFAULT, typefaceStyle));
    return view;
  }

  private android.graphics.drawable.Drawable createRoundedBackground(
    int fillColor,
    int radiusPx,
    int strokeColor
  ) {
    android.graphics.drawable.GradientDrawable drawable =
      new android.graphics.drawable.GradientDrawable();
    drawable.setColor(fillColor);
    drawable.setCornerRadius(radiusPx);
    if (strokeColor != 0) {
      drawable.setStroke(dp(1), strokeColor);
    }
    return drawable;
  }

  private void emitAction(String action) {
    ReactContext reactContext = (ReactContext) getContext();
    WritableMap payload = Arguments.createMap();
    payload.putString("kind", action);
    payload.putString(
      "restaurantId",
      snapshotPayload != null ? snapshotPayload.restaurantId : null
    );
    payload.putString(
      "shareMessage",
      snapshotPayload != null ? snapshotPayload.shareMessage : null
    );
    payload.putString(
      "websiteUrl",
      snapshotPayload != null ? snapshotPayload.websiteUrl : null
    );
    payload.putString(
      "websiteSearchQuery",
      snapshotPayload != null ? snapshotPayload.websiteSearchQuery : null
    );
    payload.putString(
      "phoneNumber",
      snapshotPayload != null ? snapshotPayload.phoneNumber : null
    );
    payload.putString(
      "phoneSearchQuery",
      snapshotPayload != null ? snapshotPayload.phoneSearchQuery : null
    );
    reactContext.getJSModule(RCTEventEmitter.class).receiveEvent(getId(), EVENT_ACTION, payload);
  }

  private int dp(int value) {
    return Math.round(
      TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value,
        getResources().getDisplayMetrics()
      )
    );
  }
}
