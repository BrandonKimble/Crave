import Foundation
import React
import UIKit

struct RestaurantPanelSnapshotPayload {
  struct HoursRow {
    let label: String
    let value: String

    init(dictionary: [String: Any]) {
      label = RestaurantPanelSnapshotPayload.stringValue(dictionary["label"], fallback: "")
      value = RestaurantPanelSnapshotPayload.stringValue(dictionary["value"], fallback: "")
    }
  }

  struct Location {
    let title: String
    let status: String?
    let address: String
    let phone: String?
    let hoursRows: [HoursRow]
    let websiteHost: String?

    init(dictionary: [String: Any]) {
      title = RestaurantPanelSnapshotPayload.stringValue(dictionary["title"], fallback: "Location")
      status = RestaurantPanelSnapshotPayload.optionalStringValue(dictionary["status"])
      address = RestaurantPanelSnapshotPayload.stringValue(
        dictionary["address"],
        fallback: "Address unavailable"
      )
      phone = RestaurantPanelSnapshotPayload.optionalStringValue(dictionary["phone"])
      hoursRows = (dictionary["hoursRows"] as? [[String: Any]] ?? []).map(HoursRow.init)
      websiteHost = RestaurantPanelSnapshotPayload.optionalStringValue(dictionary["websiteHost"])
    }
  }

  struct Dish {
    let id: String
    let name: String
    let score: String
    let activity: String
    let pollCount: String
    let totalVotes: String

    init(dictionary: [String: Any]) {
      id = RestaurantPanelSnapshotPayload.stringValue(dictionary["id"], fallback: "")
      name = RestaurantPanelSnapshotPayload.stringValue(dictionary["name"], fallback: "")
      score = RestaurantPanelSnapshotPayload.stringValue(dictionary["score"], fallback: "—")
      activity = RestaurantPanelSnapshotPayload.stringValue(dictionary["activity"], fallback: "")
      pollCount = RestaurantPanelSnapshotPayload.stringValue(dictionary["pollCount"], fallback: "0")
      totalVotes = RestaurantPanelSnapshotPayload.stringValue(
        dictionary["totalVotes"],
        fallback: "0"
      )
    }
  }

  let restaurantId: String?
  let restaurantName: String
  let primaryAddress: String
  let shareMessage: String?
  let restaurantScore: String
  let queryScoreLabel: String
  let queryScoreValue: String
  let priceLabel: String
  let hoursSummary: String
  let locationsLabel: String
  let websiteUrl: String?
  let websiteSearchQuery: String?
  let phoneNumber: String?
  let phoneSearchQuery: String?
  let isLoading: Bool
  let isFavorite: Bool
  let favoriteEnabled: Bool
  let showWebsiteAction: Bool
  let showCallAction: Bool
  let locations: [Location]
  let dishes: [Dish]

  init?(snapshotDictionary: NSDictionary?) {
    guard let object = snapshotDictionary as? [String: Any] else {
      return nil
    }

    restaurantId = Self.optionalStringValue(object["restaurantId"])
    restaurantName = Self.stringValue(object["restaurantName"], fallback: "")
    primaryAddress = Self.stringValue(object["primaryAddress"], fallback: "")
    shareMessage = Self.optionalStringValue(object["shareMessage"])
    restaurantScore = Self.stringValue(object["restaurantScore"], fallback: "—")
    queryScoreLabel = Self.stringValue(object["queryScoreLabel"], fallback: "Query score")
    queryScoreValue = Self.stringValue(object["queryScoreValue"], fallback: "—")
    priceLabel = Self.stringValue(object["priceLabel"], fallback: "—")
    hoursSummary = Self.stringValue(object["hoursSummary"], fallback: "Hours unavailable")
    locationsLabel = Self.stringValue(object["locationsLabel"], fallback: "")
    websiteUrl = Self.optionalStringValue(object["websiteUrl"])
    websiteSearchQuery = Self.optionalStringValue(object["websiteSearchQuery"])
    phoneNumber = Self.optionalStringValue(object["phoneNumber"])
    phoneSearchQuery = Self.optionalStringValue(object["phoneSearchQuery"])
    isLoading = Self.boolValue(object["isLoading"])
    isFavorite = Self.boolValue(object["isFavorite"])
    favoriteEnabled = Self.boolValue(object["favoriteEnabled"])
    showWebsiteAction = Self.boolValue(object["showWebsiteAction"])
    showCallAction = Self.boolValue(object["showCallAction"])
    locations = (object["locations"] as? [[String: Any]] ?? []).map(Location.init)
    dishes = (object["dishes"] as? [[String: Any]] ?? []).map(Dish.init)
  }

  private static func stringValue(_ raw: Any?, fallback: String) -> String {
    guard let string = raw as? String, !string.isEmpty else {
      return fallback
    }
    return string
  }

  private static func optionalStringValue(_ raw: Any?) -> String? {
    guard let string = raw as? String, !string.isEmpty else {
      return nil
    }
    return string
  }

  private static func boolValue(_ raw: Any?) -> Bool {
    if let bool = raw as? Bool {
      return bool
    }
    if let number = raw as? NSNumber {
      return number.boolValue
    }
    return false
  }
}

@objc(CraveRestaurantPanelSnapshotViewManager)
final class CraveRestaurantPanelSnapshotViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    CraveRestaurantPanelSnapshotView()
  }
}

final class CraveRestaurantPanelSnapshotView: UIView {
  @objc var snapshot: NSDictionary? {
    didSet {
      snapshotPayload = RestaurantPanelSnapshotPayload(snapshotDictionary: snapshot)
      applySnapshot()
    }
  }
  @objc var onAction: RCTDirectEventBlock?

  private let rootStack = UIStackView()
  private var snapshotPayload: RestaurantPanelSnapshotPayload?

  override init(frame: CGRect) {
    super.init(frame: frame)
    configure()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure()
  }

  override var intrinsicContentSize: CGSize {
    let fitting = rootStack.systemLayoutSizeFitting(
      CGSize(
        width: bounds.width > 0 ? bounds.width : UIScreen.main.bounds.width,
        height: UIView.layoutFittingCompressedSize.height
      ),
      withHorizontalFittingPriority: .required,
      verticalFittingPriority: .fittingSizeLevel
    )
    return CGSize(width: UIView.noIntrinsicMetric, height: fitting.height)
  }

  private func configure() {
    backgroundColor = .clear
    rootStack.axis = .vertical
    rootStack.spacing = 0
    rootStack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(rootStack)
    NSLayoutConstraint.activate([
      rootStack.topAnchor.constraint(equalTo: topAnchor),
      rootStack.leadingAnchor.constraint(equalTo: leadingAnchor),
      rootStack.trailingAnchor.constraint(equalTo: trailingAnchor),
      rootStack.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  private func applySnapshot() {
    rootStack.arrangedSubviews.forEach { view in
      rootStack.removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    guard let snapshotPayload else {
      invalidateIntrinsicContentSize()
      setNeedsLayout()
      return
    }

    rootStack.addArrangedSubview(makeHandle())
    rootStack.addArrangedSubview(makeHeader(snapshotPayload))
    rootStack.addArrangedSubview(makeMetricsRow(snapshotPayload))
    rootStack.addArrangedSubview(makePrimaryActionsRow(snapshotPayload))
    rootStack.addArrangedSubview(
      makeDetailRow(label: "Price", value: snapshotPayload.priceLabel)
    )
    rootStack.addArrangedSubview(
      makeDetailRow(label: "Hours", value: snapshotPayload.hoursSummary)
    )

    if !snapshotPayload.locations.isEmpty {
      rootStack.addArrangedSubview(
        makeSectionHeader(
          title: "Locations",
          subtitle: snapshotPayload.locationsLabel
        )
      )
      snapshotPayload.locations.forEach { location in
        rootStack.addArrangedSubview(makeLocationCard(location))
      }
    }

    rootStack.addArrangedSubview(
      makeSectionHeader(title: "Menu highlights", subtitle: "Ranked by dish score")
    )
    if snapshotPayload.isLoading {
      rootStack.addArrangedSubview(makeLoadingState())
    } else if snapshotPayload.dishes.isEmpty {
      rootStack.addArrangedSubview(makeEmptyState())
    } else {
      for (index, dish) in snapshotPayload.dishes.enumerated() {
        rootStack.addArrangedSubview(makeDishCard(dish, rank: index + 1))
      }
    }

    invalidateIntrinsicContentSize()
    setNeedsLayout()
  }

  private func makeHandle() -> UIView {
    let wrapper = UIView()
    wrapper.translatesAutoresizingMaskIntoConstraints = false
    wrapper.heightAnchor.constraint(equalToConstant: 25).isActive = true

    let handle = UIView()
    handle.translatesAutoresizingMaskIntoConstraints = false
    handle.backgroundColor = UIColor(hex: "#d1d5db")
    handle.layer.cornerRadius = 2.5
    wrapper.addSubview(handle)
    NSLayoutConstraint.activate([
      handle.widthAnchor.constraint(equalToConstant: 40),
      handle.heightAnchor.constraint(equalToConstant: 5),
      handle.centerXAnchor.constraint(equalTo: wrapper.centerXAnchor),
      handle.topAnchor.constraint(equalTo: wrapper.topAnchor, constant: 12),
    ])
    return wrapper
  }

  private func makeHeader(_ payload: RestaurantPanelSnapshotPayload) -> UIView {
    let container = UIStackView()
    container.axis = .vertical
    container.spacing = 0
    container.isLayoutMarginsRelativeArrangement = true
    container.layoutMargins = UIEdgeInsets(top: 0, left: 20, bottom: 0, right: 20)

    let row = UIStackView()
    row.axis = .horizontal
    row.alignment = .top
    row.spacing = 12

    let textGroup = UIStackView()
    textGroup.axis = .vertical
    textGroup.spacing = 4

    let title = makeLabel(
      text: payload.restaurantName,
      size: 24,
      weight: .bold,
      color: UIColor(hex: "#0f172a")
    )
    textGroup.addArrangedSubview(title)

    let address = makeLabel(
      text: payload.primaryAddress,
      size: 15,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    textGroup.addArrangedSubview(address)
    row.addArrangedSubview(textGroup)

    let actions = UIStackView()
    actions.axis = .horizontal
    actions.spacing = 8
    actions.alignment = .center
    actions.addArrangedSubview(
      makeIconButton(
        systemName: payload.isFavorite ? "heart.fill" : "heart",
        tint: payload.isFavorite ? UIColor(hex: "#ef4444") : UIColor(hex: "#1f2937"),
        enabled: payload.favoriteEnabled
      ) { [weak self] in
        self?.emitAction("favorite")
      }
    )
    actions.addArrangedSubview(
      makeIconButton(systemName: "square.and.arrow.up", tint: UIColor(hex: "#1f2937")) {
        [weak self] in
        self?.emitAction("share")
      }
    )
    actions.addArrangedSubview(
      makeIconButton(systemName: "xmark", tint: UIColor(hex: "#1f2937")) { [weak self] in
        self?.emitAction("close")
      }
    )
    row.addArrangedSubview(actions)
    container.addArrangedSubview(row)

    let divider = UIView()
    divider.translatesAutoresizingMaskIntoConstraints = false
    divider.backgroundColor = UIColor(hex: "#e5e7eb")
    divider.heightAnchor.constraint(equalToConstant: 1).isActive = true
    let dividerWrap = UIView()
    dividerWrap.translatesAutoresizingMaskIntoConstraints = false
    dividerWrap.heightAnchor.constraint(equalToConstant: 17).isActive = true
    dividerWrap.addSubview(divider)
    NSLayoutConstraint.activate([
      divider.leadingAnchor.constraint(equalTo: dividerWrap.leadingAnchor, constant: 20),
      divider.trailingAnchor.constraint(equalTo: dividerWrap.trailingAnchor, constant: -20),
      divider.bottomAnchor.constraint(equalTo: dividerWrap.bottomAnchor),
    ])
    container.addArrangedSubview(dividerWrap)

    return container
  }

  private func makeMetricsRow(_ payload: RestaurantPanelSnapshotPayload) -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.spacing = 12
    row.distribution = .fillEqually
    row.isLayoutMarginsRelativeArrangement = true
    row.layoutMargins = UIEdgeInsets(top: 16, left: 20, bottom: 0, right: 20)

    row.addArrangedSubview(
      makeMetricCard(
        title: "Restaurant score",
        value: payload.restaurantScore
      )
    )
    row.addArrangedSubview(
      makeMetricCard(
        title: payload.queryScoreLabel,
        value: payload.queryScoreValue
      )
    )
    return row
  }

  private func makePrimaryActionsRow(_ payload: RestaurantPanelSnapshotPayload) -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.spacing = 10
    row.isLayoutMarginsRelativeArrangement = true
    row.layoutMargins = UIEdgeInsets(top: 16, left: 20, bottom: 0, right: 20)
    if payload.showWebsiteAction {
      row.addArrangedSubview(makeActionPill(title: "Website") { [weak self] in
        self?.emitAction("website")
      })
    }
    if payload.showCallAction {
      row.addArrangedSubview(makeActionPill(title: "Call") { [weak self] in
        self?.emitAction("call")
      })
    }
    return row
  }

  private func makeMetricCard(title: String, value: String) -> UIView {
    let card = UIStackView()
    card.axis = .vertical
    card.spacing = 4
    card.isLayoutMarginsRelativeArrangement = true
    card.layoutMargins = UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
    card.backgroundColor = .white
    card.layer.cornerRadius = 16
    card.layer.borderWidth = 1
    card.layer.borderColor = UIColor(white: 0.06, alpha: 0.08).cgColor

    card.addArrangedSubview(
      makeLabel(text: title, size: 14, weight: .regular, color: UIColor(hex: "#475569"))
    )
    card.addArrangedSubview(
      makeLabel(text: value, size: 24, weight: .bold, color: UIColor(hex: "#0f172a"))
    )
    return card
  }

  private func makeDetailRow(label: String, value: String) -> UIView {
    let row = UIView()
    row.translatesAutoresizingMaskIntoConstraints = false
    let left = makeLabel(text: label, size: 15, weight: .bold, color: UIColor(hex: "#0f172a"))
    let right = makeLabel(text: value, size: 15, weight: .regular, color: UIColor(hex: "#475569"))
    right.textAlignment = .right
    [left, right].forEach {
      $0.translatesAutoresizingMaskIntoConstraints = false
      row.addSubview($0)
    }
    NSLayoutConstraint.activate([
      row.heightAnchor.constraint(greaterThanOrEqualToConstant: 20),
      left.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 20),
      left.topAnchor.constraint(equalTo: row.topAnchor, constant: 16),
      left.bottomAnchor.constraint(equalTo: row.bottomAnchor),
      right.leadingAnchor.constraint(greaterThanOrEqualTo: left.trailingAnchor, constant: 12),
      right.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -20),
      right.centerYAnchor.constraint(equalTo: left.centerYAnchor),
    ])
    return row
  }

  private func makeSectionHeader(title: String, subtitle: String) -> UIView {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 2
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: 24, left: 20, bottom: 0, right: 20)
    stack.addArrangedSubview(
      makeLabel(text: title, size: 18, weight: .bold, color: UIColor(hex: "#0f172a"))
    )
    stack.addArrangedSubview(
      makeLabel(text: subtitle, size: 15, weight: .regular, color: UIColor(hex: "#475569"))
    )
    return stack
  }

  private func makeLocationCard(_ location: RestaurantPanelSnapshotPayload.Location) -> UIView {
    let card = UIStackView()
    card.axis = .vertical
    card.spacing = 10
    card.isLayoutMarginsRelativeArrangement = true
    card.layoutMargins = UIEdgeInsets(top: 12, left: 14, bottom: 12, right: 14)
    card.backgroundColor = .white
    card.layer.cornerRadius = 14
    card.layer.borderWidth = 1
    card.layer.borderColor = UIColor(white: 0.06, alpha: 0.08).cgColor

    let wrapper = UIView()
    wrapper.translatesAutoresizingMaskIntoConstraints = false
    wrapper.layoutMargins = UIEdgeInsets(top: 12, left: 20, bottom: 0, right: 20)
    wrapper.preservesSuperviewLayoutMargins = false
    wrapper.addSubview(card)
    card.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      card.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor, constant: 20),
      card.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor, constant: -20),
      card.topAnchor.constraint(equalTo: wrapper.topAnchor, constant: 12),
      card.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor),
    ])

    let titleRow = UIView()
    let title = makeLabel(
      text: location.title,
      size: 16,
      weight: .bold,
      color: UIColor(hex: "#0f172a")
    )
    let status = makeLabel(
      text: location.status ?? "",
      size: 14,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    [title, status].forEach {
      $0.translatesAutoresizingMaskIntoConstraints = false
      titleRow.addSubview($0)
    }
    NSLayoutConstraint.activate([
      title.leadingAnchor.constraint(equalTo: titleRow.leadingAnchor),
      title.topAnchor.constraint(equalTo: titleRow.topAnchor),
      title.bottomAnchor.constraint(equalTo: titleRow.bottomAnchor),
      status.leadingAnchor.constraint(greaterThanOrEqualTo: title.trailingAnchor, constant: 8),
      status.trailingAnchor.constraint(equalTo: titleRow.trailingAnchor),
      status.centerYAnchor.constraint(equalTo: title.centerYAnchor),
    ])
    card.addArrangedSubview(titleRow)
    card.addArrangedSubview(
      makeLabel(
        text: location.address,
        size: 14,
        weight: .regular,
        color: UIColor(hex: "#475569")
      )
    )
    if let phone = location.phone {
      card.addArrangedSubview(
        makeLabel(
          text: "Phone  \(phone)",
          size: 14,
          weight: .regular,
          color: UIColor(hex: "#475569")
        )
      )
    }
    if !location.hoursRows.isEmpty {
      card.addArrangedSubview(
        makeLabel(text: "Hours", size: 14, weight: .bold, color: UIColor(hex: "#0f172a"))
      )
      for row in location.hoursRows {
        let hourRow = UIView()
        let day = makeLabel(
          text: row.label,
          size: 12,
          weight: .regular,
          color: UIColor(hex: "#475569")
        )
        let value = makeLabel(
          text: row.value,
          size: 12,
          weight: .regular,
          color: UIColor(hex: "#475569")
        )
        value.textAlignment = .right
        [day, value].forEach {
          $0.translatesAutoresizingMaskIntoConstraints = false
          hourRow.addSubview($0)
        }
        NSLayoutConstraint.activate([
          day.leadingAnchor.constraint(equalTo: hourRow.leadingAnchor),
          day.topAnchor.constraint(equalTo: hourRow.topAnchor),
          day.bottomAnchor.constraint(equalTo: hourRow.bottomAnchor),
          day.widthAnchor.constraint(equalToConstant: 32),
          value.leadingAnchor.constraint(equalTo: day.trailingAnchor, constant: 12),
          value.trailingAnchor.constraint(equalTo: hourRow.trailingAnchor),
          value.centerYAnchor.constraint(equalTo: day.centerYAnchor),
        ])
        card.addArrangedSubview(hourRow)
      }
    }
    if let website = location.websiteHost {
      card.addArrangedSubview(
        makeLabel(
          text: "Website  \(website)",
          size: 14,
          weight: .regular,
          color: UIColor(hex: "#475569")
        )
      )
    }
    return wrapper
  }

  private func makeDishCard(_ dish: RestaurantPanelSnapshotPayload.Dish, rank: Int) -> UIView {
    let card = UIView()
    card.backgroundColor = .white

    let rankBadge = UILabel()
    rankBadge.translatesAutoresizingMaskIntoConstraints = false
    rankBadge.text = "\(rank)"
    rankBadge.textAlignment = .center
    rankBadge.font = .systemFont(ofSize: 14, weight: .bold)
    rankBadge.textColor = UIColor(hex: "#b45309")
    rankBadge.backgroundColor = UIColor(hex: "#fef3c7")
    rankBadge.layer.cornerRadius = 16
    rankBadge.layer.masksToBounds = true

    let name = makeLabel(
      text: dish.name,
      size: 16,
      weight: .bold,
      color: UIColor(hex: "#0f172a")
    )
    let meta = makeLabel(
      text: "Dish score: \(dish.score)",
      size: 14,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    let activity = makeLabel(
      text: dish.activity,
      size: 14,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    [name, meta, activity].forEach { $0.translatesAutoresizingMaskIntoConstraints = false }

    let textColumn = UIStackView(arrangedSubviews: [name, meta])
    textColumn.axis = .vertical
    textColumn.spacing = 2
    textColumn.translatesAutoresizingMaskIntoConstraints = false

    let topRow = UIView()
    [rankBadge, textColumn, activity].forEach { topRow.addSubview($0) }
    NSLayoutConstraint.activate([
      rankBadge.leadingAnchor.constraint(equalTo: topRow.leadingAnchor, constant: 20),
      rankBadge.topAnchor.constraint(equalTo: topRow.topAnchor),
      rankBadge.widthAnchor.constraint(equalToConstant: 32),
      rankBadge.heightAnchor.constraint(equalToConstant: 32),
      textColumn.leadingAnchor.constraint(equalTo: rankBadge.trailingAnchor, constant: 12),
      textColumn.topAnchor.constraint(equalTo: topRow.topAnchor),
      textColumn.bottomAnchor.constraint(equalTo: topRow.bottomAnchor),
      activity.leadingAnchor.constraint(greaterThanOrEqualTo: textColumn.trailingAnchor, constant: 12),
      activity.trailingAnchor.constraint(equalTo: topRow.trailingAnchor, constant: -20),
      activity.centerYAnchor.constraint(equalTo: rankBadge.centerYAnchor),
      topRow.heightAnchor.constraint(greaterThanOrEqualToConstant: 32),
    ])

    let statsRow = UIStackView(arrangedSubviews: [
      makeStatColumn(title: "Poll count", value: dish.pollCount),
      makeStatColumn(title: "Total votes", value: dish.totalVotes),
    ])
    statsRow.axis = .horizontal
    statsRow.spacing = 16
    statsRow.distribution = .fillEqually
    statsRow.translatesAutoresizingMaskIntoConstraints = false

    [topRow, statsRow].forEach { view in
      view.translatesAutoresizingMaskIntoConstraints = false
      card.addSubview(view)
    }
    NSLayoutConstraint.activate([
      topRow.leadingAnchor.constraint(equalTo: card.leadingAnchor),
      topRow.trailingAnchor.constraint(equalTo: card.trailingAnchor),
      topRow.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
      statsRow.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
      statsRow.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
      statsRow.topAnchor.constraint(equalTo: topRow.bottomAnchor, constant: 14),
      statsRow.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
    ])

    return card
  }

  private func makeStatColumn(title: String, value: String) -> UIView {
    let column = UIStackView()
    column.axis = .vertical
    column.spacing = 4
    column.addArrangedSubview(
      makeLabel(text: title, size: 13, weight: .regular, color: UIColor(hex: "#475569"))
    )
    column.addArrangedSubview(
      makeLabel(text: value, size: 15, weight: .bold, color: UIColor(hex: "#0f172a"))
    )
    return column
  }

  private func makeEmptyState() -> UIView {
    let label = makeLabel(
      text: "No dishes found for this restaurant.",
      size: 15,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    label.textAlignment = .center
    let wrapper = UIView()
    wrapper.translatesAutoresizingMaskIntoConstraints = false
    wrapper.addSubview(label)
    label.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor, constant: 20),
      label.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor, constant: -20),
      label.topAnchor.constraint(equalTo: wrapper.topAnchor, constant: 24),
      label.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor, constant: -40),
    ])
    return wrapper
  }

  private func makeLoadingState() -> UIView {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 12
    stack.alignment = .center
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: 28, left: 20, bottom: 48, right: 20)
    let spinner = UIActivityIndicatorView(style: .medium)
    spinner.startAnimating()
    stack.addArrangedSubview(spinner)
    stack.addArrangedSubview(
      makeLabel(
        text: "Loading restaurant details…",
        size: 15,
        weight: .regular,
        color: UIColor(hex: "#475569")
      )
    )
    return stack
  }

  private func makeActionPill(title: String, handler: @escaping () -> Void) -> UIButton {
    let button = UIButton(type: .system)
    var configuration = UIButton.Configuration.filled()
    configuration.title = title
    configuration.baseForegroundColor = UIColor(hex: "#0f172a")
    configuration.baseBackgroundColor = .white
    configuration.cornerStyle = .capsule
    configuration.background.strokeColor = UIColor(white: 0.06, alpha: 0.08)
    configuration.background.strokeWidth = 1
    configuration.contentInsets = NSDirectionalEdgeInsets(
      top: 10,
      leading: 14,
      bottom: 10,
      trailing: 14
    )
    button.configuration = configuration
    button.addAction(UIAction { _ in handler() }, for: .touchUpInside)
    return button
  }

  private func makeIconButton(
    systemName: String,
    tint: UIColor,
    enabled: Bool = true,
    handler: @escaping () -> Void
  ) -> UIButton {
    let button = UIButton(type: .system)
    button.tintColor = tint
    button.isEnabled = enabled
    button.alpha = enabled ? 1 : 0.45
    button.setImage(UIImage(systemName: systemName), for: .normal)
    button.addAction(UIAction { _ in handler() }, for: .touchUpInside)
    return button
  }

  private func makeLabel(text: String, size: CGFloat, weight: UIFont.Weight, color: UIColor)
    -> UILabel
  {
    let label = UILabel()
    label.numberOfLines = 0
    label.text = text
    label.font = .systemFont(ofSize: size, weight: weight)
    label.textColor = color
    return label
  }

  private func emitAction(_ action: String) {
    let payload = snapshotPayload
    onAction?([
      "kind": action,
      "restaurantId": payload?.restaurantId as Any,
      "shareMessage": payload?.shareMessage as Any,
      "websiteUrl": payload?.websiteUrl as Any,
      "websiteSearchQuery": payload?.websiteSearchQuery as Any,
      "phoneNumber": payload?.phoneNumber as Any,
      "phoneSearchQuery": payload?.phoneSearchQuery as Any,
    ])
  }
}

private extension UIColor {
  convenience init(hex: String) {
    let sanitized = hex.replacingOccurrences(of: "#", with: "")
    var value: UInt64 = 0
    Scanner(string: sanitized).scanHexInt64(&value)
    let red = CGFloat((value & 0xFF0000) >> 16) / 255
    let green = CGFloat((value & 0x00FF00) >> 8) / 255
    let blue = CGFloat(value & 0x0000FF) / 255
    self.init(red: red, green: green, blue: blue, alpha: 1)
  }
}
