type LogoProps = {
  variant: "header" | "footer";
  logoUrl?: string | null;
};

export function Logo({ variant, logoUrl }: LogoProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={variant === "header" ? "h-10 w-auto max-w-[46vw] object-contain" : "h-16 w-auto object-contain"}
      />
    );
  }

  if (variant === "footer") {
    return (
      <picture>
        <source srcSet="/brand/logo.webp" type="image/webp" />
        <img src="/brand/logo.png" alt="MARHABA Hotel & Spa" width="156" height="200" className="h-24 w-auto" />
      </picture>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <picture>
        <source srcSet="/brand/mark.webp" type="image/webp" />
        <img src="/brand/mark.png" alt="" width="27" height="36" className="h-9 w-auto shrink-0" />
      </picture>
      <picture>
        <source srcSet="/brand/wordmark.webp" type="image/webp" />
        <img
          src="/brand/wordmark.png"
          alt=""
          width="137"
          height="36"
          className="h-7 w-auto max-w-[34vw] object-contain object-left sm:max-w-44"
        />
      </picture>
    </span>
  );
}
