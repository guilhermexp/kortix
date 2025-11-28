export const Logo = ({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) => {
	return (
		<svg
			className={className}
			fill="none"
			id={id}
			viewBox="0 0 100 100"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Kortix</title>
			{/* Simple asterisk/star logo */}
			<g fill="currentColor" transform="translate(50, 50)">
				<rect x="-6" y="-28" width="12" height="56" rx="3"/>
				<rect x="-6" y="-28" width="12" height="56" rx="3" transform="rotate(60)"/>
				<rect x="-6" y="-28" width="12" height="56" rx="3" transform="rotate(-60)"/>
			</g>
		</svg>
	);
};

export const LogoFull = ({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) => {
	return (
		<svg
			className={className}
			fill="none"
			id={id}
			viewBox="0 0 200 50"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Kortix</title>
			{/* Icon */}
			<g fill="currentColor" transform="translate(25, 25)">
				<rect x="-3" y="-14" width="6" height="28" rx="1.5"/>
				<rect x="-3" y="-14" width="6" height="28" rx="1.5" transform="rotate(60)"/>
				<rect x="-3" y="-14" width="6" height="28" rx="1.5" transform="rotate(-60)"/>
			</g>
			{/* Text "Kortix" */}
			<text
				x="55"
				y="33"
				fill="currentColor"
				fontFamily="system-ui, -apple-system, sans-serif"
				fontSize="28"
				fontWeight="700"
			>
				Kortix
			</text>
		</svg>
	);
};
